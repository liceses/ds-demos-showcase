from pathlib import Path

import asyncio
import logging
import mimetypes
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .client_ip import get_client_ip
from .config import settings
from .database import Base, SessionLocal, engine
from .errors import AppError
from .models import ForumTopic, Setting, Tag, TagKey, User
from .routers import admin, announcements, auth, comments, demos, forum, meta, notifications, ratings, sessions, stats, tags, users
from .security import hash_password
from .services import oss
from .services.settings_service import KEY_AUTO_APPROVE

logger = logging.getLogger("app")
logging.basicConfig(level=logging.INFO)

# slim 镜像的 mime 库不认识 .webp：不注册的话 /media 封面会以 application/octet-stream 下发
mimetypes.add_type("image/webp", ".webp")

def _json_dt(dt: datetime) -> str:
    """naive UTC 统一补 Z，避免前端按本地时间解析提前 8 小时"""
    if dt.tzinfo is None:
        return dt.isoformat() + 'Z'
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

app = FastAPI(title="DS 民间科研成果展示 API", version="0.1.0", json_encoders={datetime: _json_dt})

settings.media_path.mkdir(parents=True, exist_ok=True)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": f"http_{exc.status_code}"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """请求日志：方法/路径/状态/耗时/解析出的访客 IP（验证 IP 解析与排查刷量用）。"""
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    logger.info(
        "%s %s -> %s %.0fms ip=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        get_client_ip(request) or "-",
    )
    return response

API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(tags.router, prefix=API_PREFIX)
app.include_router(demos.router, prefix=API_PREFIX)
app.include_router(comments.router, prefix=API_PREFIX)
app.include_router(sessions.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(announcements.router, prefix=API_PREFIX)
app.include_router(meta.router, prefix=API_PREFIX)
app.include_router(stats.router, prefix=API_PREFIX)
app.include_router(ratings.router, prefix=API_PREFIX)
app.include_router(forum.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)


@app.get(API_PREFIX)
def api_root():
    """API 根信息：agent 探测 /api/v1 即可发现上传指南。"""
    return {
        "name": "DS 民间科研成果展示 API",
        "version": "1",
        "docs": "/docs",
        "agent_guide": f"{API_PREFIX}/meta/agent-guide",
        "tag_keys": f"{API_PREFIX}/tags/tag-keys",
    }


def _serve_preview(slug: str, path: str, version: str | None = None):
    if "/" in slug or "\\" in slug or not slug:
        raise HTTPException(status_code=400, detail="非法的 demo 标识", )
    safe = _safe_join(slug, path)
    is_html = safe.lower().endswith((".html", ".htm"))
    versioned = version is not None
    # 带版本号的 URL 可安全长缓存（更新后版本号变化 → 新 URL）；旧的无版本 URL 保持 no-cache 兼容。
    cache_control = "public, max-age=86400, immutable" if versioned else "no-cache"

    # HTML 文档：同源返回 + 注入 <base>，保证 localStorage 属主站源，
    # 而页内 js/css/图片相对地址会经 <base> 走版本化路径，CDN 可长缓存。
    if is_html:
        data = _read_preview_byte(slug, safe)
        if data is None:
            raise HTTPException(status_code=404, detail="文件不存在", )
        import re as _re
        html = data.decode("utf-8", errors="replace")
        # 版本化路径：base 指回 /preview/{slug}/v{version}/，子资源也带版本号；
        # 无版本路径：保持原逻辑（本地或 OSS 直连）。
        if versioned:
            base_url = f"/preview/{slug}/v{version}/"
        else:
            base_url = (
                oss.public_url(f"demos/{slug}/files/")
                if (oss.enabled() and not settings.oss_serve_local)
                else f"/preview/{slug}/"
            )
        if _re.search(r"<base\s", html, _re.IGNORECASE):
            # 若页面自带 base，替换成我们的
            html = _re.sub(r"(?i)<base[^>]*>", f'<base href="{base_url}">', html, count=1)
        elif _re.search(r"<head[^>]*>", html, _re.IGNORECASE):
            html = _re.sub(r"(?i)(<head[^>]*>)", r'\1<base href="' + base_url + '">', html, count=1)
        else:
            html = f'<base href="{base_url}">' + html
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": cache_control},
        )

    # 非 HTML（js/css/图片等）：OSS 已启用且非「本地服务」模式才 302 直连 OSS
    if oss.enabled() and not settings.oss_serve_local:
        # HEAD 检查存在性（不要 get_bytes 全量下载，避免服务器重复拉取）
        if oss.object_exists(f"demos/{slug}/files/{safe}"):
            url = oss.public_url(f"demos/{slug}/files/{safe}")
            if versioned:
                url += f"?v={version}"
            return RedirectResponse(url, headers={"Cache-Control": cache_control})

    file_path = (settings.demos_path / slug / "files" / safe).resolve()
    if file_path.is_file():
        return FileResponse(file_path, headers={"Cache-Control": cache_control})
    raise HTTPException(status_code=404, detail="文件不存在", )


@app.get("/preview/{slug}/v{version}/{path:path}")
def preview_file_versioned(slug: str, version: str, path: str):
    return _serve_preview(slug, path, version)


@app.get("/preview/{slug}/{path:path}")
def preview_file(slug: str, path: str):
    return _serve_preview(slug, path)


def _read_preview_byte(slug: str, safe: str) -> bytes | None:
    file_path = (settings.demos_path / slug / "files" / safe).resolve()
    if file_path.is_file():
        return file_path.read_bytes()
    if oss.enabled():
        return oss.get_bytes(f"demos/{slug}/files/{safe}")
    return None


@app.get("/media/{path:path}")
def media_file(path: str):
    from pathlib import Path as _P
    safe = _P(path).as_posix().replace("\\", "/")
    if oss.enabled() and not settings.oss_serve_local:
        # HEAD 检查存在性，避免全量下载对象（重定向本身 no-store，最终对象自带 immutable 缓存）
        if oss.object_exists(f"media/{safe}"):
            return RedirectResponse(
                oss.public_url(f"media/{safe}"),
                headers={"Cache-Control": "no-store"},
            )
    file_path = (settings.media_path / safe).resolve()
    if not str(file_path).startswith(str(settings.media_path.resolve())):
        raise HTTPException(status_code=400, detail="非法的路径", )
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在", )
    return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400, immutable"})


def _safe_join(slug: str, path: str) -> str:
    root = settings.demos_path / slug / "files"
    file_path = (root / path).resolve()
    if not str(file_path).startswith(str(root.resolve())):
        raise HTTPException(status_code=400, detail="非法的路径", )
    return file_path.relative_to(root).as_posix()


def _ensure_demo_columns() -> None:
    """SQLite 增量迁移：给已存在的 demos 表补充新增列（create_all 不会改旧表）。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "demos" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("demos")}
    additions = [
        ("demo_type", "TEXT NOT NULL DEFAULT 'web'"),
        ("external_url", "TEXT"),
        ("prompt", "TEXT NOT NULL DEFAULT ''"),
        ("video_url", "TEXT"),
        ("guest_name", "TEXT"),
        ("idempotency_key", "TEXT"),
        ("content_hash", "TEXT"),
        ("single_file", "TEXT"),
        ("rating_sum", "INTEGER NOT NULL DEFAULT 0"),
        ("rating_count", "INTEGER NOT NULL DEFAULT 0"),
        ("rating_avg", "REAL NOT NULL DEFAULT 0"),
        ("rating_god", "INTEGER NOT NULL DEFAULT 0"),
        ("rating_ghost", "INTEGER NOT NULL DEFAULT 0"),
        ("updated_at", "DATETIME"),
    ]
    with engine.begin() as conn:
        for name, ddl in additions:
            if name not in cols:
                conn.exec_driver_sql(f"ALTER TABLE demos ADD COLUMN {name} {ddl}")
        # 幂等键唯一索引（SQLite 中 NULL 可重复，不影响无 key 的历史行）
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_demos_idempotency_key ON demos (idempotency_key)")
        # 内容哈希普通索引（按作者去重查询）
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_demos_content_hash ON demos (content_hash)")


def _ensure_tag_columns() -> None:
    """SQLite 增量迁移：给已存在的 tags 表补充 group 列（固定值分组/厂商）。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "tags" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("tags")}
    if "group" not in cols:
        with engine.begin() as conn:
            # group 是 SQLite 保留字，必须加双引号
            conn.exec_driver_sql('ALTER TABLE tags ADD COLUMN "group" TEXT')


def _ensure_announcement_columns() -> None:
    """SQLite 增量迁移：给已存在的 announcements 表补充扩展列。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "announcements" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("announcements")}
    additions = [
        ("pinned", "BOOLEAN NOT NULL DEFAULT 0"),
        ("status", "TEXT NOT NULL DEFAULT 'published'"),
        ("category", "TEXT NOT NULL DEFAULT 'general'"),
        ("published_at", "DATETIME"),
        ("expires_at", "DATETIME"),
        ("topic_id", "INTEGER"),
    ]
    with engine.begin() as conn:
        for name, ddl in additions:
            if name not in cols:
                conn.exec_driver_sql(f"ALTER TABLE announcements ADD COLUMN {name} {ddl}")


def _ensure_user_columns() -> None:
    """SQLite 增量迁移：给已存在的 users 表补充论坛信任字段。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    additions = [
        ("trust_level", "INTEGER NOT NULL DEFAULT 0"),
        ("need_review", "BOOLEAN NOT NULL DEFAULT 1"),
        ("github_bound", "BOOLEAN NOT NULL DEFAULT 0"),
        ("reputation", "INTEGER NOT NULL DEFAULT 0"),
        ("received_likes", "INTEGER NOT NULL DEFAULT 0"),
        ("received_thanks", "INTEGER NOT NULL DEFAULT 0"),
    ]
    with engine.begin() as conn:
        for name, ddl in additions:
            if name not in cols:
                conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {name} {ddl}")


def _ensure_forum_columns() -> None:
    """SQLite 增量迁移：给已存在的 forum_topics 表补充互动列（locked/solved）。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "forum_topics" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("forum_topics")}
    with engine.begin() as conn:
        for name, ddl in [("locked", "BOOLEAN NOT NULL DEFAULT 0"), ("solved", "BOOLEAN NOT NULL DEFAULT 0")]:
            if name not in cols:
                conn.exec_driver_sql(f"ALTER TABLE forum_topics ADD COLUMN {name} {ddl}")


def _ensure_forum_reply_columns() -> None:
    """SQLite 增量迁移：给已存在的 forum_replies 表补充 status / source_comment_id。"""
    from sqlalchemy import inspect as sa_inspect

    insp = sa_inspect(engine)
    if "forum_replies" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("forum_replies")}
    additions = [
        ("status", "TEXT NOT NULL DEFAULT 'normal'"),
        ("source_comment_id", "INTEGER"),
        ("parent_id", "INTEGER"),
    ]
    with engine.begin() as conn:
        for name, ddl in additions:
            if name not in cols:
                conn.exec_driver_sql(f"ALTER TABLE forum_replies ADD COLUMN {name} {ddl}")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_forum_replies_status ON forum_replies (status)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_forum_replies_source_comment_id ON forum_replies (source_comment_id)")
        # 统一 reply_count 口径：只统计 normal 回复，顺带修复历史漂移/双重扣减
        conn.exec_driver_sql(
            """
            UPDATE forum_topics
            SET reply_count = (
                SELECT COUNT(*) FROM forum_replies
                WHERE forum_replies.topic_id = forum_topics.id
                  AND forum_replies.status = 'normal'
            )
            """
        )


def _seed_forum_notice() -> None:
    """论坛首帖初始化：幂等创建置顶的「用户须知 & 安全说明」。"""
    db = SessionLocal()
    try:
        if db.query(ForumTopic).filter(ForumTopic.category == "notice", ForumTopic.pinned == True).first():  # noqa: E712
            return
        admin = db.query(User).filter(User.role == "admin").first()
        path = settings.site_repo_path / "docs/论坛首帖-用户须知与安全说明.md"
        if path.exists():
            content = path.read_text(encoding="utf-8")
        else:
            content = "论坛发帖须知：请遵守法律法规，文明发言，不得发布违规内容。"
        db.add(ForumTopic(
            title="论坛发帖须知 & 安全说明",
            content=content,
            author_id=admin.id if admin else None,
            category="notice",
            tags="须知,安全",
            pinned=True,
            sticky=True,
            status="normal",
        ))
        db.commit()
    finally:
        db.close()


def init_db() -> None:
    settings.demos_path.mkdir(parents=True, exist_ok=True)
    settings.media_path.mkdir(parents=True, exist_ok=True)

    # 默认封面
    default_cover = settings.media_path / "covers" / "default.svg"
    default_cover.parent.mkdir(parents=True, exist_ok=True)
    if not default_cover.exists():
        default_cover.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">'
            '<rect width="640" height="480" fill="#4ecdc4"/>'
            '<rect x="14" y="14" width="612" height="452" fill="none" stroke="#000" stroke-width="8"/>'
            '<text x="320" y="250" font-family="Arial, sans-serif" font-size="64" font-weight="900" text-anchor="middle" fill="#000">DS DEMO</text>'
            '</svg>',
            encoding="utf-8",
        )
    if oss.enabled():
        try:
            oss.put_bytes(
                "media/covers/default.svg",
                default_cover.read_text(encoding="utf-8").encode(),
                "image/svg+xml",
                extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
            )
        except Exception as e:  # noqa: BLE001 —— OSS 不可用不阻塞启动，降级本地存储
            print(f"[warn] OSS 默认封面上传失败（降级本地存储）: {e}", flush=True)

    Base.metadata.create_all(bind=engine)
    _ensure_demo_columns()
    _ensure_tag_columns()
    _ensure_announcement_columns()
    _ensure_user_columns()
    _ensure_forum_columns()
    _ensure_forum_reply_columns()
    _seed_forum_notice()

    db = SessionLocal()
    try:
        # 标签键定义（固定值 / 开放值 / 数字值）——幂等：缺失才插入，已有数据不动
        _DEFAULT_TAG_KEYS = [
            ("model", "fixed", "模型", "AI 模型版本（固定值）", 1),
            ("plugin", "fixed", "插件", "使用的插件（固定值）", 2),
            ("type", "fixed", "类型", "Demo 类型（固定值）", 3),
            ("skills", "fixed", "技能", "技能工作区（固定值）", 4),
            ("preset", "fixed", "预设", "预设配置（固定值）", 5),
            ("category", "fixed", "分类", "作品分类（固定值）", 6),
            ("game", "open", "游戏", "游戏名称（自定义值，如 mc / pvz）", 7),
            ("rounds", "int", "轮数", "生成轮数（必须为整数）", 8),
        ]
        for key, mode, label, description, sort in _DEFAULT_TAG_KEYS:
            if db.get(TagKey, key) is None:
                db.add(TagKey(key=key, mode=mode, label=label, description=description, sort=sort))

        # 默认标签（含历史自由值）——幂等：缺失才插入
        _DEFAULT_TAGS = [
            ("model", "dsv4", "模型版本总类", None),
            ("model", "dsv4-flash", "DeepSeek V4 Flash —— 快速推理", "dsv4"),
            ("model", "dsv4-pro", "DeepSeek V4 Pro —— 强推理", "dsv4"),
            ("model", "dsv4flash", "历史自由值：dsv4-flash 的旧写法", None),
            ("model", "ds-unknown", "历史自由值：未识别的模型", None),
            ("plugin", "routing-suite", "路由套件插件", None),
            ("plugin", "suite", "历史自由值：路由套件的旧写法", None),
            ("skills", "J-space", "J-space 技能工作区", None),
            ("skills", "j-space", "历史自由值：J-space 的旧写法", None),
            ("preset", "router-standard", "标准路由预设", None),
            ("preset", "spec", "历史自由值：规格预设", None),
            ("type", "effect", "视觉特效类", None),
            ("type", "widget", "小组件类", None),
            ("type", "game", "小游戏类", None),
            ("type", "demo", "综合演示类", None),
            ("category", "3D建模", "3D 建模类", None),
            ("category", "仿真", "仿真类", None),
            ("category", "动画", "动画类", None),
            ("category", "图形学", "图形学类", None),
        ]
        for key, value, description, parent_value in _DEFAULT_TAGS:
            if db.query(Tag).filter(Tag.key == key, Tag.value == value).first() is None:
                parent = None
                if parent_value:
                    parent = db.query(Tag).filter(Tag.key == key, Tag.value == parent_value).first()
                db.add(Tag(
                    key=key,
                    value=value,
                    description=description,
                    parent_id=parent.id if parent else None,
                ))

        if db.query(User).filter(User.username == "admin").first() is None:
            db.add(User(username="admin", password_hash=hash_password("admin123"), role="admin", bio="站点管理员"))

        if db.get(Setting, KEY_AUTO_APPROVE) is None:
            db.add(Setting(key=KEY_AUTO_APPROVE, value="true" if settings.auto_approve else "false"))

        db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _auto_sync_oss()


def _auto_sync_oss() -> None:
    """OSS 可用时，后台任务把本地已有文件补传到 OSS（幂等：只补缺失，不阻塞启动）。"""
    from .services import oss as _oss
    from .services.oss_sync import start_sync

    if not _oss.enabled():
        return
    try:
        started = start_sync(force=False)
        print(f"[oss-sync] 启动自动同步: started={started}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[oss-sync] 自动同步启动失败: {e}", flush=True)
