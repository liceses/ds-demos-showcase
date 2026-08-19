import json
import os
import shutil
import uuid
import zipfile
from pathlib import Path

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, optional_user
from ..models import Announcement, Demo, DemoTimeline, DemoTag, SessionLog, Tag, TagKey, User
from ..schemas import DemoCreateResult, DemoDetailOut, DemoSummaryOut, Paginated
from ..serializers import serialize_demo
from ..services import oss, storage
from ..services.settings_service import get_auto_approve

router = APIRouter(prefix="/demos", tags=["demos"])


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
    # 自动附加作者标签（保留 key，跳过键定义校验）
    if demo.author_id is not None:
        author = db.get(User, demo.author_id)
        if author:
            author_tag = _ensure_tag(db, "author", author.username)
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
    sort: str = Query(default="newest", pattern="^(newest|popular)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Demo)
    if status:
        query = query.filter(Demo.status == status)

    for kv in tag:
        from sqlalchemy import select

        parts = kv.split(":", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=422, detail=f"非法标签过滤: {kv}", )
        sub = (
            select(DemoTag.demo_id)
            .join(Tag, DemoTag.tag_id == Tag.id)
            .where(Tag.key == parts[0], Tag.value == parts[1])
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
        query = query.order_by(Demo.view_count.desc(), Demo.created_at.desc())
    else:
        query = query.order_by(Demo.created_at.desc())

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


def _validate_demo_type(t: str) -> str:
    if t not in ("web", "zip", "link"):
        raise HTTPException(status_code=422, detail="demo_type 需为 web（网页应用）/ zip（文件包）/ link（外部链接）", )
    return t


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


@router.post("", status_code=201, response_model=DemoCreateResult)
async def create_demo(
    title: str = Form(...),
    description: str = Form(""),
    tags: str | None = Form(None),
    demo_type: str = Form("web"),
    external_url: str | None = Form(None),
    prompt: str | None = Form(None),
    video_url: str | None = Form(None),
    cover: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    demo_type = _validate_demo_type(demo_type)

    if demo_type == "link":
        ext_url = _validate_url(external_url, "external_url")
        zip_bytes = None
    else:
        ext_url = None
        if file is None or not file.filename or not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="必须上传 zip 文件", )
        zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")

    slug = _unique_slug(db, title)
    demo = Demo(
        slug=slug,
        title=title.strip(),
        description=description,
        demo_type=demo_type,
        external_url=ext_url,
        prompt=(prompt or "").strip(),
        video_url=_clean_url(video_url),
    )
    demo.author_id = user.id
    status = "approved" if get_auto_approve(db) else "pending"
    demo.status = status

    cover_url = "/media/covers/default.svg"
    if cover is not None and cover.filename:
        ext = Path(cover.filename or "").suffix.lstrip(".") or "png"
        cover_bytes = await _read_limited(cover, settings.max_cover_size, "封面超过大小限制")
        cover_url = storage.save_cover(cover_bytes, ext)
    demo.cover_url = cover_url

    # 落库获得 id，再写文件
    db.add(demo)
    db.flush()
    db.commit()

    if zip_bytes is not None:
        try:
            storage.extract_zip(zip_bytes, slug, require_index=(demo_type == "web"))
        except HTTPException:
            db.delete(demo)
            db.commit()
            shutil.rmtree(storage.demo_dir(slug), ignore_errors=True)
            raise
        storage.upload_demo_to_oss(slug)
        oss.put_bytes(f"demos/{slug}/{slug}.zip", zip_bytes, "application/zip")

    _set_demo_tags(db, demo, _parse_tags(tags))
    db.commit()

    # 自动公告：新 demo 发布
    db.add(Announcement(
        type="auto",
        title="新 Demo 发布",
        content=demo.title,
        demo_slug=slug,
        created_by=user.id,
    ))
    _add_timeline(db, demo.id, "v1", "创建", None)
    db.commit()
    return DemoCreateResult(slug=slug, status=status)


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
        cover_bytes = await _read_limited(cover, settings.max_cover_size, "封面超过大小限制")
        demo.cover_url = storage.save_cover(cover_bytes, ext)
        changed = True
    if file is not None and file.filename:
        if demo.demo_type == "link":
            raise HTTPException(status_code=400, detail="链接类型不需要上传 zip 文件", )
        if not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="必须上传 zip 文件", )
        zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
        # 勾选「保留旧版本」：先把当前文件快照成独立 demo 页面，再覆盖
        if keep_old_version:
            snapshot = _snapshot_demo(db, demo, user)
        storage.extract_zip(zip_bytes, slug, require_index=(demo.demo_type == "web"))
        storage.upload_demo_to_oss(slug)
        oss.put_bytes(f"demos/{slug}/{slug}.zip", zip_bytes, "application/zip")
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
    storage.upload_demo_to_oss(new_slug)
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

    # OSS 已启用：直接 302 到 OSS 公有读地址，不占服务器带宽
    if oss.enabled():
        return RedirectResponse(oss.public_url(f"demos/{slug}/{slug}.zip"))

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