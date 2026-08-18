import json
import os
import shutil
import uuid
import zipfile
from pathlib import Path

from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, optional_user
from ..models import Demo, DemoTag, Tag, User
from ..schemas import DemoCreateResult, DemoDetailOut, DemoSummaryOut, Paginated
from ..serializers import serialize_demo
from ..services import git_service, oss, storage
from ..services.settings_service import get_auto_approve

router = APIRouter(prefix="/demos", tags=["demos"])


def _find_demo(db: Session, slug: str) -> Demo:
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    return demo


def _ensure_tag(db: Session, key_value: str) -> Tag:
    key, _, value = key_value.partition(":")
    if not key or not value:
        raise HTTPException(status_code=422, detail=f"非法标签格式: {key_value}", )
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        tag = Tag(key=key, value=value, description="")
        db.add(tag)
        db.flush()
    return tag


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="tags 字段需为 JSON 字符串数组", )
    if not isinstance(data, list) or not all(isinstance(x, str) for x in data):
        raise HTTPException(status_code=422, detail="tags 字段需为 JSON 字符串数组", )
    return data


async def _read_limited(file: UploadFile, limit: int, msg: str) -> bytes:
    data = await file.read()
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=msg, )
    return data


def _set_demo_tags(db: Session, demo: Demo, key_values: list[str]) -> None:
    db.query(DemoTag).filter(DemoTag.demo_id == demo.id).delete()
    for kv in key_values:
        tag = _ensure_tag(db, kv)
        db.add(DemoTag(demo_id=demo.id, tag_id=tag.id))
    # 自动附加作者标签
    if demo.author_id is not None:
        author = db.get(User, demo.author_id)
        if author:
            author_tag = _ensure_tag(db, f"author:{author.username}")
            db.add(DemoTag(demo_id=demo.id, tag_id=author_tag.id))


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


@router.post("", status_code=201, response_model=DemoCreateResult)
async def create_demo(
    title: str = Form(...),
    description: str = Form(""),
    tags: str | None = Form(None),
    cover: UploadFile | None = File(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="必须上传 zip 文件", )
    zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")

    slug = _unique_slug(db, title)
    demo = Demo(slug=slug, title=title.strip(), description=description)
    demo.author_id = user.id
    status = "approved" if get_auto_approve(db) else "pending"
    demo.status = status

    cover_url = "/media/covers/default.svg"
    if cover is not None and cover.filename:
        ext = Path(cover.filename or "").suffix.lstrip(".") or "png"
        cover_bytes = await _read_limited(cover, settings.max_cover_size, "封面超过大小限制")
        cover_url = storage.save_cover(cover_bytes, ext)
    demo.cover_url = cover_url

    # 落库获得 id，再写文件与 git
    db.add(demo)
    db.flush()
    db.commit()

    try:
        storage.extract_zip(zip_bytes, slug)
    except HTTPException:
        db.delete(demo)
        db.commit()
        shutil.rmtree(storage.demo_dir(slug), ignore_errors=True)
        raise

    _set_demo_tags(db, demo, _parse_tags(tags))
    db.commit()

    storage.upload_demo_to_oss(slug)
    oss.put_bytes(f"demos/{slug}/{slug}.zip", zip_bytes, "application/zip")

    git_service.commit_all(slug, author_name=user.username, author_email=f"{user.username}@demo-site")
    return DemoCreateResult(slug=slug, status=status)


@router.put("/{slug}", status_code=204)
async def update_demo(
    slug: str,
    title: str | None = Form(None),
    description: str | None = Form(None),
    tags: str | None = Form(None),
    cover: UploadFile | None = File(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    demo = _find_demo(db, slug)
    if demo.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权修改该 Demo", )

    if title is not None:
        demo.title = title.strip()
    if description is not None:
        demo.description = description
    if tags is not None:
        _set_demo_tags(db, demo, _parse_tags(tags))
    if cover is not None and cover.filename:
        ext = Path(cover.filename).suffix.lstrip(".") or "png"
        cover_bytes = await _read_limited(cover, settings.max_cover_size, "封面超过大小限制")
        demo.cover_url = storage.save_cover(cover_bytes, ext)
    if file is not None and file.filename:
        if not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="必须上传 zip 文件", )
        zip_bytes = await _read_limited(file, settings.max_upload_size, "上传超过大小限制")
        storage.extract_zip(zip_bytes, slug)
        storage.upload_demo_to_oss(slug)
        oss.put_bytes(f"demos/{slug}/{slug}.zip", zip_bytes, "application/zip")
        git_service.commit_all(slug, author_name=user.username, author_email=f"{user.username}@demo-site")

    demo.updated_at = datetime.utcnow()
    db.commit()
    return Response(status_code=204)


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