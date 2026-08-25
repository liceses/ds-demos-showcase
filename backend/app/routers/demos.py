import asyncio
import hashlib
import ipaddress
import json
import os
import random
import re
import shutil
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, optional_user
from ..models import Announcement, Demo, DemoTimeline, DemoTag, SessionLog, Tag, TagKey, User
from ..schemas import DemoCreateResult, DemoDetailOut, DemoFromUrlIn, DemoSummaryOut, Paginated
from ..serializers import serialize_demo
from ..services import oss, storage
from ..services.settings_service import get_auto_approve, get_auto_approve_public

router = APIRouter(prefix="/demos", tags=["demos"])

# 匿名上传限流：IP -> [unix 时间戳]（每小时窗口）
_anon_uploads: dict[str, list[float]] = defaultdict(list)
ANON_RATE_LIMIT = 20  # 次/小时/IP


def _anon_rate_limit(request: Request) -> None:
    """匿名上传限流：每 IP 每小时最多 ANON_RATE_LIMIT 次。"""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = now - 3600
    _anon_uploads[ip] = [t for t in _anon_uploads[ip] if t > window]
    if len(_anon_uploads[ip]) >= ANON_RATE_LIMIT:
        raise HTTPException(status_code=429, detail=f"匿名上传过于频繁（{ANON_RATE_LIMIT} 次/小时），请稍后再试或登录", )
    _anon_uploads[ip].append(now)


# ---- 高并发缓存：相关推荐 / 首页随机（锁只护缓存字典，不护 DB 查询）----
_CACHE_LOCK = threading.Lock()
_RELATED_CACHE: dict[str, tuple[float, list]] = {}
_RANDOM_EXP = 0.0
_RANDOM_IDS: list[int] = []
_RANDOM_TTL = 60  # 秒
_RANDOM_TTL_REL = 60  # related 缓存秒数


def _related_cache_get(slug: str) -> list | None:
    with _CACHE_LOCK:
        hit = _RELATED_CACHE.get(slug)
        if hit and hit[0] > time.time():
            return hit[1]
    return None


def _related_cache_set(slug: str, result: list) -> None:
    with _CACHE_LOCK:
        _RELATED_CACHE[slug] = (time.time() + _RANDOM_TTL_REL, result)


def _random_ids(db, page: int, page_size: int) -> list[int]:
    """返回一次随机序下的 [offset, offset+page_size) 的已上架 demo id（60s 缓存整份随机序）。
    锁只护缓存；DB 查询在锁外执行（复用请求会话），避免锁内二次开会话导致连接竞争/500。"""
    global _RANDOM_IDS, _RANDOM_EXP
    with _CACHE_LOCK:
        fresh = time.time() <= _RANDOM_EXP and bool(_RANDOM_IDS)
        ids = list(_RANDOM_IDS) if fresh else None
    if ids is None:
        # 锁外：用请求会话查库 + 洗牌
        live_ids = [d for (d,) in db.query(Demo.id).filter(Demo.status == "approved").all()]
        random.shuffle(live_ids)
        with _CACHE_LOCK:
            if time.time() > _RANDOM_EXP:
                _RANDOM_IDS = live_ids
                _RANDOM_EXP = time.time() + _RANDOM_TTL
            ids = live_ids
    start = (page - 1) * page_size
    return ids[start : start + page_size]


def _find_demo(db: Session, slug: str) -> Demo:
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    return demo


def _ensure_tag(db: Session, key: str, value: str) -> Tag:
    """内部标签（author / version-of 等保留 key）直接创建或复用。"""
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        tag = Tag(key=key, value=value, description="")
        db.add(tag)
        db.flush()
    return tag


def _resolve_tag(db: Session, item: str | dict) -> Tag:
    """按标签键定义校验并解析用户提交的标签：
    - 支持字符串 "k:v" 或对象 {"key","value","description?"}
    - fixed: value 必须是已存在的固定值
    - open:  任意自定义 value（自动建标签；首次创建可写入 description）
    - int:   value 必须是整数（自动建标签，规范化存储）
    """
    if isinstance(item, str):
        key, _, value = item.partition(":")
        description = None
    else:
        key = item.get("key", "")
        value = item.get("value", "")
        description = item.get("description") or None

    key = key.strip()
    value = value.strip()
    if not key or not value:
        raise HTTPException(status_code=422, detail=f"非法标签格式: {item}", )
    if len(key) > 64 or len(value) > 64:
        raise HTTPException(status_code=422, detail=f"标签 key/value 过长: {key}:{value}", )

    key_def = db.get(TagKey, key)
    if key_def is None:
        raise HTTPException(status_code=422, detail=f"未知标签 key: {key}（请管理员先在标签键管理中定义）", )

    if key_def.mode == "fixed":
        tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
        if tag is None:
            raise HTTPException(status_code=422, detail=f"{key}:{value} 不是该键的固定值，请从候选中选择", )
        return tag

    if key_def.mode == "int":
        try:
            int(value)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"{key} 的值必须是整数（如 rounds:3）", )
        value = str(int(value))

    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        # 首次创建 open/int 值时，可写入用户提供的介绍
        tag = Tag(key=key, value=value, description=description or "")
        db.add(tag)
        db.flush()
    return tag


def _parse_tags(raw: str | None) -> list:
    """解析 tags JSON：支持字符串数组 ["k:v"] 或对象数组 [{"key","value","description?"}]。"""
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="tags 字段需为 JSON 数组", )
    if not isinstance(data, list):
        raise HTTPException(status_code=422, detail="tags 字段需为 JSON 数组", )
    for item in data:
        if isinstance(item, str):
            continue
        if isinstance(item, dict) and isinstance(item.get("key"), str) and isinstance(item.get("value"), str):
            continue
        raise HTTPException(status_code=422, detail="tags 元素需为 \"k:v\" 字符串或 {key,value,description?} 对象", )
    return data


async def _read_limited(file: UploadFile, limit: int, msg: str) -> bytes:
    data = await file.read()
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=msg, )
    return data


def _set_demo_tags(db: Session, demo: Demo, key_values: list[str]) -> None:
    db.query(DemoTag).filter(DemoTag.demo_id == demo.id).delete()
    for kv in key_values:
        tag = _resolve_tag(db, kv)
        db.add(DemoTag(demo_id=demo.id, tag_id=tag.id))
    # 自动附加作者标签（保留 key，跳过键定义校验）；匿名统一为 public
    author_name = None
    if demo.author_id is not None:
        author = db.get(User, demo.author_id)
        if author:
            author_name = author.username
    else:
        author_name = "public"
    if author_name:
        author_tag = _ensure_tag(db, "author", author_name)
        db.add(DemoTag(demo_id=demo.id, tag_id=author_tag.id))


def _add_timeline(
    db: Session,
    demo_id: int,
    version_label: str,
    message: str,
    old_slug: str | None = None,
) -> None:
    db.add(DemoTimeline(
        demo_id=demo_id,
        version_label=version_label,
        message=message,
        old_slug=old_slug,
    ))


def _unique_slug(db: Session, title: str) -> str:
    for _ in range(10):
        slug = storage.make_slug(title)
        if db.query(Demo).filter(Demo.slug == slug).first() is None:
            return slug
    raise HTTPException(status_code=500, detail="slug 生成失败", )


@router.get("", response_model=Paginated)
def list_demos(
    status: str | None = Query(default="approved"),
    tag: list[str] = Query(default=[]),
    q: str | None = None,
    author: str | None = None,
    sort: str = Query(default="newest", pattern="^(newest|popular|random|prompt)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Demo)
    if status:
        query = query.filter(Demo.status == status)

    if author:
        if author == "public":
            # public 虚拟身份：所有未注册上传（author_id 为空）
            query = query.filter(Demo.author_id.is_(None))
        else:
            user = db.query(User).filter(User.username == author).first()
            if user is None:
                return Paginated(items=[], total=0, page=page, page_size=page_size)
            query = query.filter(Demo.author_id == user.id)

    for kv in tag:
        from sqlalchemy import cast, select
        from sqlalchemy import Integer as SAInteger

        parts = kv.split(":", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=422, detail=f"非法标签过滤: {kv}", )
        key, val = parts[0], parts[1]
        key_def = db.get(TagKey, key)
        if key_def is not None and key_def.mode == "int" and "-" in val:
            # int 键范围：tag=rounds:3-10
            lo_s, _, hi_s = val.partition("-")
            try:
                lo, hi = int(lo_s), int(hi_s)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"int 标签范围格式需为 key:lo-hi，如 rounds:3-10", )
            sub = (
                select(DemoTag.demo_id)
                .join(Tag, DemoTag.tag_id == Tag.id)
                .where(
                    Tag.key == key,
                    cast(Tag.value, SAInteger) >= lo,
                    cast(Tag.value, SAInteger) <= hi,
                )
            )
        else:
            sub = (
                select(DemoTag.demo_id)
                .join(Tag, DemoTag.tag_id == Tag.id)
                .where(Tag.key == key, Tag.value == val)
            )
        query = query.filter(Demo.id.in_(sub))

    if q:
        like = f"%{q}%"
        from sqlalchemy import func as sa_func, select

        tag_ids = (
            db.query(DemoTag.demo_id)
            .join(Tag, DemoTag.tag_id == Tag.id)
            .filter(sa_func.concat(Tag.key, ":", Tag.value).ilike(like))
        )
        ids = select(Demo.id).where(
            (Demo.title.ilike(like))
            | (Demo.description.ilike(like))
            | (Demo.id.in_(tag_ids))
        )
        query = query.filter(Demo.id.in_(ids))

    if sort == "popular":
        query = query.order_by(Demo.view_count.desc(), Demo.created_at.desc(), Demo.id.desc())
        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()
    elif sort == "random":
        # 首页精选整批随机：缓存整份随机 id 序（60s），避免每次 ORDER BY RANDOM() 全表扫
        total = query.count()
        ids = _random_ids(db, page, page_size)
        if ids:
            items = db.query(Demo).filter(Demo.id.in_(ids)).all()
            order = {did: i for i, did in enumerate(ids)}
            items.sort(key=lambda d: order.get(d.id, 10**9))
        else:
            items = []
    elif sort == "prompt":
        # 提示词优先：填了 prompt 的排前面（SQL 层排序，跨页稳定），同组按最新
        query = query.order_by((Demo.prompt == "").asc(), Demo.created_at.desc(), Demo.id.desc())
        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()
    else:
        # 次级键 id 兜底：同一秒发布的 demo 也有确定顺序，避免刷新/翻页抖动
        query = query.order_by(Demo.created_at.desc(), Demo.id.desc())
        total = query.count()
        items = query.offset((page - 1) * page_size).limit(page_size).all()

    return Paginated(
        items=[serialize_demo(db, d) for d in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{slug}", response_model=DemoDetailOut)
def get_demo(slug: str, db: Session = Depends(get_db), user: User | None = Depends(optional_user)):
    demo = _find_demo(db, slug)
    demo.view_count += 1
    db.commit()
    return serialize_demo(db, demo, user.id if user else None, detail=True)


@router.get("/{slug}/related", response_model=list[DemoSummaryOut])
def related_demos(
    slug: str,
    limit: int = Query(default=30, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """相关推荐候选池：标签重合度 + 同类型 + 热度 + 随机（60s 缓存，缓解高并发）。"""
    cached = _related_cache_get(slug)
    if cached is None:
        cached = _compute_related(db, slug)
        _related_cache_set(slug, cached)
    return cached[:limit]


def _compute_related(db: Session, slug: str) -> list:
    """计算相关推荐（结果已序列化为字典；锁外执行 DB 查询）。"""
    current = _find_demo(db, slug)
    cur_tags = {f"{dt.tag.key}:{dt.tag.value}" for dt in current.tag_associations}
    cur_type = current.demo_type
    cur_id = current.id

    core_weight = {"type": 3, "game": 3, "model": 2, "category": 2,
                   "plugin": 1, "skills": 1, "preset": 1, "rounds": 1}

    rows = db.query(Demo).filter(Demo.status == "approved", Demo.id != cur_id).all()
    scored: list[tuple[float, Demo]] = []
    for d in rows:
        d_tags = {f"{dt.tag.key}:{dt.tag.value}" for dt in d.tag_associations}
        shared = cur_tags & d_tags
        if not shared and d.demo_type != cur_type:
            # 完全无关的弱推荐：给很低的保底分，保证池子不至于空
            score = random.random() * 0.3
        else:
            score = sum(core_weight.get(k.split(":", 1)[0], 1) for k in shared)
            if d.demo_type == cur_type:
                score += 0.5
            score += (d.view_count + 2 * d.download_count) * 0.001
            score += random.random() * 0.5
        scored.append((score, d))

    scored.sort(key=lambda x: -x[0])
    return [serialize_demo(db, d) for _, d in scored[:50]]


def _validate_demo_type(t: str) -> str:
    if t not in ("web", "zip", "link"):
        raise HTTPException(status_code=422, detail="demo_type 需为 web（网页应用）/ zip（文件包）/ link（外部链接）", )
    return t


def _single_file_ext(filename: str | None) -> str | None:
    """按后缀识别单文件模式：.html/.htm → html，.svg → svg，否则 None。"""
    if not filename:
        return None
    name = filename.lower()
    if name.endswith(".html") or name.endswith(".htm"):
        return "html"
    if name.endswith(".svg"):
        return "svg"
    return None


def _validate_single_file(data: bytes, ext: str) -> None:
    head = data[:512].lstrip().lower()
    if ext == "html":
        if not (head.startswith(b"<!doctype html") or head.startswith(b"<html")):
            raise HTTPException(status_code=400, detail="单 HTML 文件内容不是有效 HTML（需以 <!doctype html> 或 <html 开头）", )
    else:
        if not head.startswith(b"<svg"):
            raise HTTPException(status_code=400, detail="单 SVG 文件内容不是有效 SVG（需以 <svg 开头）", )


def _clean_url(url: str | None) -> str | None:
    """可选链接字段：空则 None，非空必须是 http(s)。"""
    if not url or not url.strip():
        return None
    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=422, detail="链接需为 http(s) 地址", )
    if len(url) > 2000:
        raise HTTPException(status_code=422, detail="链接过长", )
    return url


def _validate_url(url: str | None, field: str) -> str:
    """必填链接字段（link 类型的 external_url）。"""
    cleaned = _clean_url(url)
    if cleaned is None:
        raise HTTPException(status_code=422, detail=f"{field} 为链接类型必填", )
    return cleaned


def _assert_public_url(url: str) -> None:
    """SSRF 基础防护：拒绝内网/回环/保留地址。"""
    host = urlparse(url).hostname
    if not host:
        raise HTTPException(status_code=422, detail="无效的下载地址", )
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="无法解析下载地址", )
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=422, detail="不允许下载内网/保留地址", )


def _download_url_bytes(url: str, limit: int, what: str) -> bytes:
    """从 URL 下载字节（带大小上限与超时）。"""
    url = _clean_url(url)
    if url is None:
        raise HTTPException(status_code=422, detail=f"{what} 地址无效", )
    _assert_public_url(url)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ds-demos-showcase/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read(limit + 1)
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"下载{what}失败: HTTP {e.code}", )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"下载{what}失败: {e}", )
    if len(data) > limit:
        raise HTTPException(status_code=400, detail=f"{what}超过大小限制", )
    return data


def _oss_upload_safe(slug: str, zip_bytes: bytes | None = None) -> None:
    """上传到 OSS（失败不阻塞：降级本地存储，仅警告）。"""
    try:
        storage.upload_demo_to_oss(slug)
        if zip_bytes is not None:
            oss.put_bytes(
                f"demos/{slug}/{slug}.zip",
                zip_bytes,
                "application/zip",
                extra_headers={"Cache-Control": "public, max-age=3600"},
            )
    except Exception as e:  # noqa: BLE001
        print(f"[warn] OSS 上传失败（降级本地存储）: {slug} {e}", flush=True)


def _zip_content_hash(data: bytes) -> str:
    """zip 原始字节 sha256（按作者去重）。"""
    return hashlib.sha256(data).hexdigest()


def _author_scope_id(user: User | None) -> int | None:
    """作者去重作用域：登录用 user.id；匿名（public）共用 None。"""
    return user.id if user else None


def _find_duplicate_demo(
    db: Session,
    content_hash: str,
    author_scope_id: int | None,
    exclude_id: int | None = None,
) -> Demo | None:
    """查找同一作者下内容相同（同 content_hash）的已有 demo。
    匿名（author_scope_id=None）表示所有 public 上传共享同一去重池。"""
    q = db.query(Demo).filter(Demo.content_hash == content_hash)
    if author_scope_id is None:
        q = q.filter(Demo.author_id.is_(None))
    else:
        q = q.filter(Demo.author_id == author_scope_id)
    if exclude_id is not None:
        q = q.filter(Demo.id != exclude_id)
    return q.first()


def _dup_conflict(demo: Demo) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail=f"已存在相同内容的 Demo（同一作者）：/demo/{demo.slug}",
    )


async def _create_demo_record(
    db: Session,
    user: User | None,
    *,
    slug: str,
    title: str,
    description: str,
    tags_raw: str | None,
    demo_type: str,
    external_url: str | None,
    prompt: str,
    video_url: str | None,
    cover_bytes: bytes | None = None,
    cover_ext: str = "png",
    zip_bytes: bytes | None = None,
    trusted: bool = False,
    idempotency_key: str | None = None,
    content_hash: str | None = None,
    single_file: str | None = None,
) -> tuple[Demo, str, bool]:
    """创建 Demo 公共流程：落库 → 解压/OSS → 标签 → 公告 → 时间线。
    - user 为空 = 匿名（public 虚拟身份）：author_id=NULL，作者恒为 public
    - trusted（UPLOAD_CODE 匹配）或已登录且 auto_approve → approved
    - 匿名：auto_approve_all 或 auto_approve_public 任一开 → approved，否则 pending
    - idempotency_key：唯一幂等键；并发/重试撞键时返回已有结果（created=False）
    - content_hash：zip/单文件内容哈希（按作者去重，由调用方校验后传入）
    - single_file：'html' | 'svg' 时按单文件保存（zip_bytes 存的是该文件内容）
    - 解压/OSS/封面上传等阻塞操作放线程池，避免卡死事件循环（批量上传时其他接口还能响应）
    """
    demo = Demo(
        slug=slug,
        title=title,
        description=description,
        demo_type=demo_type,
        external_url=external_url,
        prompt=(prompt or "").strip(),
        video_url=_clean_url(video_url),
        idempotency_key=idempotency_key,
        content_hash=content_hash,
        single_file=single_file,
    )
    demo.author_id = user.id if user else None

    if trusted:
        status = "approved"
    elif user is not None:
        status = "approved" if get_auto_approve(db) else "pending"
    else:
        status = "approved" if (get_auto_approve(db) or get_auto_approve_public(db)) else "pending"
    demo.status = status

    if cover_bytes:
        demo.cover_url = await asyncio.to_thread(storage.save_cover, cover_bytes, cover_ext)
    else:
        demo.cover_url = "/media/covers/default.svg"

    db.add(demo)
    db.flush()
    try:
        db.commit()
    except IntegrityError:
        # 幂等键冲突：返回已存在的 demo，不重复创建
        db.rollback()
        existing = (
            db.query(Demo).filter(Demo.idempotency_key == idempotency_key).first() if idempotency_key else None
        )
        if existing is None:
            raise
        return existing, existing.status, False

    if single_file:
        # 单文件 demo：直接保存 index.html / index.svg，不解压
        await asyncio.to_thread(storage.save_single_file, slug, single_file, zip_bytes or b"")
        await asyncio.to_thread(_oss_upload_safe, slug)
    elif zip_bytes is not None:
        try:
            await asyncio.to_thread(storage.extract_zip, zip_bytes, slug, require_index=(demo_type == "web"))
        except HTTPException:
            db.delete(demo)
            db.commit()
            shutil.rmtree(storage.demo_dir(slug), ignore_errors=True)
            raise
        await asyncio.to_thread(_oss_upload_safe, slug, zip_bytes)

    _set_demo_tags(db, demo, _parse_tags(tags_raw))
    db.commit()

    db.add(Announcement(
        type="auto",
        title="新 Demo 发布",
        content=demo.title,
        demo_slug=slug,
        status="published",
        category="demo",
        created_by=user.id if user else None,
    ))
    _add_timeline(db, demo.id, "v1", "创建", None)
    db.commit()
    return demo, status, True


def _uploader_context(
    request: Request,
    user: User | None,
    upload_code: str | None,
) -> bool:
    """匿名上传身份解析：返回 trusted。
    - 已登录：trusted=False（身份用账号）
    - 未登录 + upload_code 匹配：trusted=True（跳过限流、直接放行）
    - 未登录：限流（作者恒为 public）
    """
    if user is not None:
        return False
    trusted = bool(settings.upload_code and upload_code and upload_code.strip() == settings.upload_code)
    if not trusted:
        _anon_rate_limit(request)
    return trusted


def _validate_idempotency_key(key: str | None) -> str | None:
    """校验幂等键：8~128 位字母数字 _ . -；空返回 None。"""
    if not key:
        return None
    key = key.strip()
    if not (8 <= len(key) <= 128):
        raise HTTPException(status_code=422, detail="idempotency_key 长度需为 8~128", )
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", key):
        raise HTTPException(status_code=422, detail="idempotency_key 仅允许字母数字 _ . -", )
    return key


def _existing_demo_by_key(db: Session, key: str | None) -> Demo | None:
    if not key:
        return None
    return db.query(Demo).filter(Demo.idempotency_key == key).first()


@router.post("", status_code=201, response_model=DemoCreateResult)
async def create_demo(
    request: Request,
    title: str = Form(...),
    description: str = Form(""),
    tags: str | None = Form(None),
    demo_type: str = Form("web"),
    external_url: str | None = Form(None),
    prompt: str | None = Form(None),
    video_url: str | None = Form(None),
    upload_code: str | None = Form(None),
    idempotency_key: str | None = Form(None),
    force: bool = Form(False),
    cover: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    demo_type = _validate_demo_type(demo_type)
    idem_key = _validate_idempotency_key(idempotency_key)
    # 幂等：同 key 已成功创建过 → 直接返回已有结果（agent 重试去重，省去重新上传）
    existing = _existing_demo_by_key(db, idem_key)
    if existing is not None:
        return DemoCreateResult(slug=existing.slug, status=existing.status, created=False)

    # force 仅管理员生效
    allow_force = bool(force) and user is not None and user.role == "admin"
    content_hash = None

    if demo_type == "link":
        ext_url = _validate_url(external_url, "external_url")
        if file is not None and file.filename:
            raise HTTPException(status_code=400, detail="链接类型不需要上传文件", )
        zip_bytes = None
        single_file = None
    else:
        ext_url = None
        if file is None or not file.filename:
            raise HTTPException(status_code=400, detail="必须上传文件", )
        single_file = _single_file_ext(file.filename)
        if single_file:
            if demo_type == "zip":
                raise HTTPException(status_code=400, detail="zip 类型需要上传 zip 文件", )
            zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
            _validate_single_file(zip_bytes, single_file)
        else:
            if not file.filename.lower().endswith(".zip"):
                raise HTTPException(status_code=400, detail="必须上传 zip 文件或单个 .html/.svg 文件", )
            zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
        # 内容一致性：同一作者不允许上传相同内容（管理员 force 可跳过）
        content_hash = _zip_content_hash(zip_bytes)
        dup = _find_duplicate_demo(db, content_hash, _author_scope_id(user))
        if dup is not None and not allow_force:
            raise _dup_conflict(dup)

    cover_bytes = None
    cover_ext = "png"
    if cover is not None and cover.filename:
        cover_ext = Path(cover.filename or "").suffix.lstrip(".") or "png"
        cover_bytes = await _read_limited(cover, settings.max_upload_size, "封面文件过大")

    trusted = _uploader_context(request, user, upload_code)

    demo, status, created = await _create_demo_record(
        db, user,
        slug=_unique_slug(db, title),
        title=title.strip(),
        description=description,
        tags_raw=tags,
        demo_type=demo_type,
        external_url=ext_url,
        prompt=prompt or "",
        video_url=video_url,
        cover_bytes=cover_bytes,
        cover_ext=cover_ext,
        zip_bytes=zip_bytes,
        trusted=trusted,
        idempotency_key=idem_key,
        content_hash=content_hash,
        single_file=single_file,
    )
    return DemoCreateResult(slug=demo.slug, status=status, created=created)


@router.post("/from-url", status_code=201, response_model=DemoCreateResult)
async def create_demo_from_url(
    request: Request,
    body: DemoFromUrlIn,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    """AI agent 友好：JSON 提交，zip/封面走 URL（后端下载），免 multipart；可匿名上传。
    强制要求简介与至少 1 个标签，保证 AI 上传的信息质量。"""
    demo_type = _validate_demo_type(body.demo_type)

    if not body.description.strip():
        raise HTTPException(status_code=422, detail="description 必填（AI 自动上传需要填写简介）", )
    if not body.tags or len(body.tags) == 0:
        raise HTTPException(status_code=422, detail="tags 至少需要 1 个标签（AI 自动上传需要打适宜标签）", )

    idem_key = _validate_idempotency_key(body.idempotency_key)
    # 幂等：同 key 已创建 → 直接返回已有结果（agent 超时重试不再重复上传）
    existing = _existing_demo_by_key(db, idem_key)
    if existing is not None:
        return DemoCreateResult(slug=existing.slug, status=existing.status, created=False)

    if demo_type == "link":
        ext_url = _validate_url(body.external_url, "external_url")
        if body.zip_url or body.file_url:
            raise HTTPException(status_code=400, detail="链接类型不需要提供 zip_url/file_url", )
        zip_bytes = None
        content_hash = None
        single_file = None
    else:
        ext_url = None
        single_file = None
        if body.file_url:
            if demo_type == "zip":
                raise HTTPException(status_code=422, detail="zip 类型需要提供 zip_url", )
            single_file = _single_file_ext(urlparse(body.file_url).path)
            if not single_file:
                raise HTTPException(status_code=422, detail="file_url 需为 .html/.svg 单文件", )
            zip_bytes = await asyncio.to_thread(_download_url_bytes, body.file_url, settings.max_upload_size, "单文件")
            _validate_single_file(zip_bytes, single_file)
        elif body.zip_url:
            zip_bytes = await asyncio.to_thread(_download_url_bytes, body.zip_url, settings.max_upload_size, "zip")
            if zip_bytes[:2] != b"PK":
                raise HTTPException(status_code=400, detail="zip_url 下载的内容不是 zip 文件", )
        else:
            raise HTTPException(status_code=422, detail="web/zip 类型需要提供 zip_url 或 file_url", )
        # 内容一致性：同一作者不允许上传相同内容（管理员 force 可跳过）
        allow_force = bool(body.force) and user is not None and user.role == "admin"
        content_hash = _zip_content_hash(zip_bytes)
        dup = _find_duplicate_demo(db, content_hash, _author_scope_id(user))
        if dup is not None and not allow_force:
            raise _dup_conflict(dup)

    cover_bytes = None
    cover_ext = "png"
    if body.cover_url:
        cover_bytes = await asyncio.to_thread(_download_url_bytes, body.cover_url, settings.max_upload_size, "封面")
        cover_ext = Path(urlparse(body.cover_url).path).suffix.lstrip(".") or "png"

    tags_raw = json.dumps(body.tags, ensure_ascii=False) if body.tags is not None else None

    trusted = _uploader_context(request, user, body.upload_code)

    demo, status, created = await _create_demo_record(
        db, user,
        slug=_unique_slug(db, body.title),
        title=body.title.strip(),
        description=body.description,
        tags_raw=tags_raw,
        demo_type=demo_type,
        external_url=ext_url,
        prompt=body.prompt,
        video_url=body.video_url,
        cover_bytes=cover_bytes,
        cover_ext=cover_ext,
        zip_bytes=zip_bytes,
        trusted=trusted,
        idempotency_key=idem_key,
        content_hash=content_hash,
        single_file=single_file,
    )
    return DemoCreateResult(slug=demo.slug, status=status, created=created)


@router.put("/{slug}", status_code=204)
async def update_demo(
    slug: str,
    title: str | None = Form(None),
    description: str | None = Form(None),
    tags: str | None = Form(None),
    demo_type: str | None = Form(None),
    external_url: str | None = Form(None),
    prompt: str | None = Form(None),
    video_url: str | None = Form(None),
    cover: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    commit_message: str | None = Form(None),
    keep_old_version: bool = Form(False),
    force: bool = Form(False),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    demo = _find_demo(db, slug)
    if demo.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权修改该 Demo", )

    changed = False
    snapshot: Demo | None = None
    if title is not None and title.strip() != demo.title:
        demo.title = title.strip()
        changed = True
    if description is not None and description != demo.description:
        demo.description = description
        changed = True
    if demo_type is not None:
        new_type = _validate_demo_type(demo_type)
        if new_type != demo.demo_type:
            demo.demo_type = new_type
            changed = True
    if external_url is not None:
        if demo.demo_type == "link":
            demo.external_url = _validate_url(external_url, "external_url")
        else:
            demo.external_url = _clean_url(external_url)
        changed = True
    if prompt is not None:
        demo.prompt = prompt.strip()
        changed = True
    if video_url is not None:
        demo.video_url = _clean_url(video_url)
        changed = True
    if tags is not None:
        _set_demo_tags(db, demo, _parse_tags(tags))
        changed = True
    if cover is not None and cover.filename:
        ext = Path(cover.filename).suffix.lstrip(".") or "png"
        cover_bytes = await _read_limited(cover, settings.max_upload_size, "封面文件过大")
        demo.cover_url = await asyncio.to_thread(storage.save_cover, cover_bytes, ext)
        changed = True
    if file is not None and file.filename:
        if demo.demo_type == "link":
            raise HTTPException(status_code=400, detail="链接类型不需要上传文件", )
        single_file = _single_file_ext(file.filename)
        if single_file:
            if demo.demo_type == "zip":
                raise HTTPException(status_code=400, detail="zip 类型需要上传 zip 文件", )
            zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
            _validate_single_file(zip_bytes, single_file)
        else:
            if not file.filename.lower().endswith(".zip"):
                raise HTTPException(status_code=400, detail="必须上传 zip 文件或单个 .html/.svg 文件", )
            zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
        # 内容一致性：不更新成与同作者其他 demo 相同的内容（排除自身；管理员 force 可跳过）
        allow_force = bool(force) and user.role == "admin"
        h = _zip_content_hash(zip_bytes)
        dup = _find_duplicate_demo(db, h, demo.author_id, exclude_id=demo.id)
        if dup is not None and not allow_force:
            raise _dup_conflict(dup)
        demo.content_hash = h
        demo.single_file = single_file
        # 勾选「保留旧版本」：先把当前文件快照成独立 demo 页面，再覆盖
        if keep_old_version:
            snapshot = _snapshot_demo(db, demo, user)
        if single_file:
            await asyncio.to_thread(storage.save_single_file, slug, single_file, zip_bytes)
            await asyncio.to_thread(_oss_upload_safe, slug)
        else:
            await asyncio.to_thread(storage.extract_zip, zip_bytes, slug, require_index=(demo.demo_type == "web"))
            await asyncio.to_thread(_oss_upload_safe, slug, zip_bytes)
        changed = True

    demo.updated_at = datetime.utcnow()
    db.commit()

    if changed:
        message = (commit_message or "更新 demo").strip() or "更新 demo"
        # 作品更新公告：内容即更新说明（不再依赖 git）
        db.add(Announcement(
            type="demo_update",
            title=f"Demo 更新：{demo.title}",
            content=message,
            demo_slug=slug,
            status="published",
            category="demo",
            created_by=user.id,
        ))
        # 轻量时间线：记录本次更新；若保留了旧版本，可点击跳转到旧版页面
        version_count = db.query(func.count(DemoTimeline.id)).filter(DemoTimeline.demo_id == demo.id).scalar() or 0
        _add_timeline(
            db,
            demo.id,
            f"v{version_count + 1}",
            message,
            old_slug=snapshot.slug if snapshot else None,
        )
        db.commit()

    return Response(status_code=204)


def _snapshot_demo(db: Session, demo: Demo, user: User) -> Demo:
    """把当前 demo 的快照复制成独立的新 demo（保留旧版本为单独页面）。"""
    from ..models import Demo as DemoModel

    old_slug = demo.slug
    new_slug = _unique_slug(db, demo.title)

    files_src = storage.demo_files_dir(old_slug)
    sessions_src = storage.demo_sessions_dir(old_slug)
    if demo.demo_type != "link":
        if files_src.exists():
            dst = storage.demo_files_dir(new_slug)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(files_src, dst)
        if sessions_src.exists():
            dst = storage.demo_sessions_dir(new_slug)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(sessions_src, dst)

    snapshot = DemoModel(
        slug=new_slug,
        title=demo.title,
        description=demo.description,
        cover_url=demo.cover_url,
        demo_type=demo.demo_type,
        external_url=demo.external_url,
        prompt=demo.prompt,
        video_url=demo.video_url,
        status=demo.status,
        author_id=demo.author_id,
        content_hash=demo.content_hash,
        single_file=demo.single_file,
    )
    db.add(snapshot)
    db.flush()

    # 复制标签 + 标记旧版本归属
    for dt in db.query(DemoTag).filter(DemoTag.demo_id == demo.id).all():
        db.add(DemoTag(demo_id=snapshot.id, tag_id=dt.tag_id))
    version_tag = _ensure_tag(db, "version-of", old_slug)
    db.add(DemoTag(demo_id=snapshot.id, tag_id=version_tag.id))

    # 复制会话日志记录（文件已随目录复制）
    for log in db.query(SessionLog).filter(SessionLog.demo_id == demo.id).all():
        db.add(SessionLog(
            demo_id=snapshot.id,
            filename=log.filename,
            file_size=log.file_size,
            created_at=log.created_at,
        ))

    # 旧版本页面自己的时间线：可跳回最新版
    _add_timeline(db, snapshot.id, "旧版", "旧版本快照", old_slug=old_slug)

    db.commit()
    _oss_upload_safe(new_slug)
    return snapshot


@router.delete("/{slug}", status_code=204)
def delete_demo(slug: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    demo = _find_demo(db, slug)
    if demo.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权删除该 Demo", )
    db.delete(demo)
    db.commit()
    shutil.rmtree(storage.demo_dir(slug), ignore_errors=True)
    storage.delete_demo_from_oss(slug)
    return Response(status_code=204)


@router.get("/{slug}/download")
def download_demo(slug: str, db: Session = Depends(get_db)):
    demo = _find_demo(db, slug)
    if demo.demo_type == "link":
        raise HTTPException(status_code=400, detail="链接类型无下载，请直接访问外部链接", )
    demo.download_count += 1
    db.commit()

    # 单文件 demo：直接返回原文件（不打包 zip）
    if demo.single_file:
        name = "index.html" if demo.single_file == "html" else "index.svg"
        path = storage.demo_files_dir(slug) / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Demo 文件不存在", )
        media = "text/html" if demo.single_file == "html" else "image/svg+xml"
        return FileResponse(path, media_type=media, filename=f"{slug}.{demo.single_file}")

    # OSS 已启用且非「本地服务」模式：302 到 OSS 公有读地址，不占服务器带宽
    if oss.enabled() and not settings.oss_serve_local:
        return RedirectResponse(
            oss.public_url(f"demos/{slug}/{slug}.zip"),
            headers={"Cache-Control": "public, max-age=60"},
        )

    files_dir = storage.demo_files_dir(slug)
    if not files_dir.exists():
        raise HTTPException(status_code=404, detail="Demo 文件不存在", )

    tmp_dir = settings.demos_path / ".tmp_download"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    zip_path = tmp_dir / f"{slug}-{uuid.uuid4().hex}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in files_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(files_dir))

    from starlette.background import BackgroundTask

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{slug}.zip",
        background=BackgroundTask(os.remove, zip_path),
    )