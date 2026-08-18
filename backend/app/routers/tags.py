from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import DemoTag, Tag, TagKey, User
from ..schemas import TagCreate, TagDetail, TagKeyOut, TagKeyUpsert, TagKeyValueOut, TagOut
from ..serializers import tag_dict

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/tag-keys", response_model=list[TagKeyOut])
def list_tag_keys(db: Session = Depends(get_db)):
    """标签键定义（供发布/编辑页做选择器 + 标签主页展示）。"""
    keys = db.query(TagKey).order_by(TagKey.sort, TagKey.key).all()
    result: list[TagKeyOut] = []
    for k in keys:
        rows = (
            db.query(Tag, func.count(DemoTag.demo_id))
            .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
            .filter(Tag.key == k.key)
            .group_by(Tag.id)
            .order_by(Tag.value)
            .all()
        )
        values = [
            TagKeyValueOut(value=t.value, description=t.description, demo_count=count)
            for t, count in rows
        ]
        result.append(
            TagKeyOut(
                key=k.key,
                mode=k.mode,
                label=k.label,
                description=k.description,
                sort=k.sort,
                values=values,
                demo_count=sum(v.demo_count for v in values),
            )
        )
    return result


def find_tag_by_key_value(db: Session, key_value: str) -> Tag:
    if ":" not in key_value:
        raise HTTPException(status_code=404, detail="标签不存在", )
    key, value = key_value.split(":", 1)
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在", )
    return tag


@router.get("/{key_value}", response_model=TagDetail)
def get_tag(key_value: str, db: Session = Depends(get_db)):
    tag = find_tag_by_key_value(db, key_value)
    data = tag_dict(db, tag)
    data["parent"] = tag_dict(db, tag.parent) if tag.parent else None
    data["children"] = [tag_dict(db, c) for c in tag.children]
    return data


@router.post("", status_code=201, response_model=TagOut)
def create_tag(body: TagCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """新增固定值标签（仅 admin）。"""
    if body.key == "author":
        raise HTTPException(status_code=400, detail="author 为保留 key", )
    key_def = db.get(TagKey, body.key)
    if key_def is None:
        raise HTTPException(status_code=400, detail="未知标签 key，请先在标签键管理中创建", )
    if key_def.mode != "fixed":
        raise HTTPException(status_code=400, detail=f"{body.key} 为 {key_def.mode} 模式，无需预定义 value", )
    duplicate = db.query(Tag).filter(Tag.key == body.key, Tag.value == body.value).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="标签已存在", )
    if body.parent_id is not None:
        parent = db.get(Tag, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=404, detail="父标签不存在", )
    tag = Tag(
        key=body.key,
        value=body.value,
        description=body.description,
        parent_id=body.parent_id,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag_dict(db, tag)


# ---------- 标签键管理（admin） ----------
@router.post("/admin/tag-keys", status_code=201, response_model=TagKeyOut)
def create_tag_key(body: TagKeyUpsert, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if body.key == "author":
        raise HTTPException(status_code=400, detail="author 为保留 key", )
    existing = db.get(TagKey, body.key)
    if existing is not None:
        raise HTTPException(status_code=409, detail="标签键已存在，请用 PUT 更新", )
    k = TagKey(
        key=body.key,
        mode=body.mode,
        label=body.label,
        description=body.description,
        sort=body.sort,
    )
    db.add(k)
    db.commit()
    return _tag_key_out(db, k)


RESERVED_TAG_KEYS = {"author", "version-of"}


@router.put("/admin/tag-keys/{key}", response_model=TagKeyOut)
def update_tag_key(
    key: str,
    body: TagKeyUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在", )
    k.mode = body.mode
    k.label = body.label
    k.description = body.description
    k.sort = body.sort
    db.commit()
    return _tag_key_out(db, k)


@router.delete("/admin/tag-keys/{key}", status_code=204)
def delete_tag_key(key: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """删除标签键（同时删除该键下未被引用的标签值）。"""
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止删除", )
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在", )
    referenced = (
        db.query(func.count(DemoTag.demo_id))
        .join(Tag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == key)
        .scalar()
        or 0
    )
    if referenced > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该键下有 {referenced} 个标签正被 demo 引用，禁止删除",
        )
    db.query(Tag).filter(Tag.key == key).delete(synchronize_session=False)
    db.delete(k)
    db.commit()


@router.delete("/admin/tag-keys/{key}/values/{value}", status_code=204)
def delete_tag_value(
    key: str,
    value: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """删除某个标签值（被 demo 引用时禁止删除）。"""
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止删除", )
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        raise HTTPException(status_code=404, detail="标签值不存在", )
    referenced = (
        db.query(func.count(DemoTag.demo_id)).filter(DemoTag.tag_id == tag.id).scalar() or 0
    )
    if referenced > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该标签正被 {referenced} 个 demo 引用，禁止删除",
        )
    db.delete(tag)
    db.commit()


def _tag_key_out(db: Session, k: TagKey) -> TagKeyOut:
    rows = (
        db.query(Tag, func.count(DemoTag.demo_id))
        .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == k.key)
        .group_by(Tag.id)
        .order_by(Tag.value)
        .all()
    )
    values = [
        TagKeyValueOut(value=t.value, description=t.description, demo_count=count)
        for t, count in rows
    ]
    return TagKeyOut(
        key=k.key,
        mode=k.mode,
        label=k.label,
        description=k.description,
        sort=k.sort,
        values=values,
        demo_count=sum(v.demo_count for v in values),
    )
