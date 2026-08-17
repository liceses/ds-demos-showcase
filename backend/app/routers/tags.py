from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import Tag, User
from ..schemas import TagCreate, TagDetail, TagOut
from ..serializers import tag_dict

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    tags = db.query(Tag).order_by(Tag.key, Tag.value).all()
    return [tag_dict(db, t) for t in tags]


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
def create_tag(body: TagCreate, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if body.key == "author":
        raise HTTPException(status_code=400, detail="author 为保留 key", )
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