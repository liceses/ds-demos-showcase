from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Setting, Tag, User
from .routers import admin, auth, comments, commits, demos, sessions, tags, users
from .security import hash_password
from .services import oss
from .services.settings_service import KEY_AUTO_APPROVE

app = FastAPI(title="DS 民间科研成果展示 API", version="0.1.0")

settings.media_path.mkdir(parents=True, exist_ok=True)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": f"http_{exc.status_code}"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(tags.router, prefix=API_PREFIX)
app.include_router(demos.router, prefix=API_PREFIX)
app.include_router(comments.router, prefix=API_PREFIX)
app.include_router(sessions.router, prefix=API_PREFIX)
app.include_router(commits.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)


@app.get("/preview/{slug}/{path:path}")
def preview_file(slug: str, path: str):
    if "/" in slug or "\\" in slug or not slug:
        raise HTTPException(status_code=400, detail="非法的 demo 标识", )
    safe = _safe_join(slug, path)
    if oss.enabled():
        return RedirectResponse(oss.public_url(f"demos/{slug}/files/{safe}"))
    root = settings.demos_path / slug / "files"
    file_path = (root / safe).resolve()
    if not str(file_path).startswith(str(root.resolve())):
        raise HTTPException(status_code=400, detail="非法的路径", )
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在", )
    return FileResponse(file_path)


@app.get("/media/{path:path}")
def media_file(path: str):
    from pathlib import Path as _P
    safe = _P(path).as_posix().replace("\\", "/")
    if oss.enabled():
        return RedirectResponse(oss.public_url(f"media/{safe}"))
    file_path = (settings.media_path / safe).resolve()
    if not str(file_path).startswith(str(settings.media_path.resolve())):
        raise HTTPException(status_code=400, detail="非法的路径", )
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在", )
    return FileResponse(file_path)


def _safe_join(slug: str, path: str) -> str:
    root = settings.demos_path / slug / "files"
    file_path = (root / path).resolve()
    if not str(file_path).startswith(str(root.resolve())):
        raise HTTPException(status_code=400, detail="非法的路径", )
    return file_path.relative_to(root).as_posix()


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
        oss.put_bytes("media/covers/default.svg", default_cover.read_text(encoding="utf-8").encode(), "image/svg+xml")

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(Tag).count() == 0:
            def tag(key: str, value: str, description: str = "", parent: Tag | None = None) -> Tag:
                t = Tag(key=key, value=value, description=description, parent_id=parent.id if parent else None)
                db.add(t)
                db.flush()
                return t

            model_root = tag("model", "dsv4", "模型版本总类")
            tag("model", "dsv4-flash", "DeepSeek V4 Flash —— 快速推理", model_root)
            tag("model", "dsv4-pro", "DeepSeek V4 Pro —— 强推理", model_root)
            tag("plugin", "routing-suite", "路由套件插件")
            tag("skills", "J-space", "J-space 技能工作区")
            tag("preset", "router-standard", "标准路由预设")
            tag("type", "effect", "视觉特效类")
            tag("type", "widget", "小组件类")
            tag("type", "game", "小游戏类")

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
