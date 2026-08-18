from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Announcement, User
from ..schemas import AnnouncementOut, AnnouncementUpsert

router = APIRouter(tags=["announcements"])


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db)):
    items = (
        db.query(Announcement)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .limit(50)
        .all()
    )
    return items


@router.post("/admin/announcements", status_code=201, response_model=AnnouncementOut)
def create_announcement(
    body: AnnouncementUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ann = Announcement(
        type="manual",
        title=body.title,
        content=body.content,
        demo_slug=body.demo_slug,
        created_by=admin.id,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


@router.put("/admin/announcements/{ann_id}", response_model=AnnouncementOut)
def update_announcement(
    ann_id: int,
    body: AnnouncementUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ann = db.get(Announcement, ann_id)
    if ann is None:
        raise HTTPException(status_code=404, detail="公告不存在", )
    ann.title = body.title
    ann.content = body.content
    if body.demo_slug is not None:
        ann.demo_slug = body.demo_slug
    db.commit()
    db.refresh(ann)
    return ann


@router.delete("/admin/announcements/{ann_id}", status_code=204)
def delete_announcement(
    ann_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ann = db.get(Announcement, ann_id)
    if ann is None:
        raise HTTPException(status_code=404, detail="公告不存在", )
    db.delete(ann)
    db.commit()
