from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Announcement, User
from ..schemas import AnnouncementOut, AnnouncementUpsert
from ..services.site_git import list_site_commits

router = APIRouter(tags=["announcements"])


def _parse_commit_date(value: str) -> datetime:
    try:
        d = datetime.fromisoformat(value)
        if d.tzinfo is not None:
            d = d.astimezone(timezone.utc).replace(tzinfo=None)
        return d
    except ValueError:
        return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db)):
    items: list[AnnouncementOut] = []

    # 1) 数据库公告：manual（手动）/ auto（新 Demo 发布）/ demo_update（作品更新）
    for a in (
        db.query(Announcement)
        .order_by(Announcement.created_at.desc(), Announcement.id.desc())
        .limit(50)
        .all()
    ):
        out = AnnouncementOut.model_validate(a)
        # 兼容旧数据：之前 type=update 且带 demo_slug 的记录归为作品更新
        if a.type == "update" and a.demo_slug:
            out.type = "demo_update"
        items.append(out)

    # 2) 实时「更新公告」：网站自身 git 仓库的 commit 信息
    for i, c in enumerate(list_site_commits(30)):
        items.append(
            AnnouncementOut(
                id=-(i + 1),
                type="update",
                title="站点更新",
                content=c["message"],
                demo_slug=None,
                created_by=None,
                created_at=_parse_commit_date(c["date"]),
            )
        )

    items.sort(key=lambda x: (x.created_at, x.id), reverse=True)
    return items[:50]


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
    # 允许清空：demo_slug 传 null 即置空
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
