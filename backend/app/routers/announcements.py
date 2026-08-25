from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
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


def _is_public_visible(a: Announcement) -> bool:
    """公开可见：published 且未过期且已到发布时间。"""
    now = datetime.utcnow()
    if a.status != "published":
        return False
    if a.published_at is not None and a.published_at > now:
        return False
    if a.expires_at is not None and a.expires_at < now:
        return False
    return True


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db)):
    items: list[AnnouncementOut] = []

    # 1) 数据库公告：只返回 published 且未过期/已到发布时间的
    for a in (
        db.query(Announcement)
        .order_by(Announcement.pinned.desc(), Announcement.created_at.desc(), Announcement.id.desc())
        .limit(50)
        .all()
    ):
        if not _is_public_visible(a):
            continue
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
                pinned=False,
                status="published",
                category="system",
                published_at=None,
                expires_at=None,
                created_by=None,
                created_at=_parse_commit_date(c["date"]),
            )
        )

    items.sort(key=lambda x: (x.pinned, x.created_at, x.id), reverse=True)
    return items[:50]


@router.get("/announcements/{ann_id}", response_model=AnnouncementOut)
def get_announcement(ann_id: int, db: Session = Depends(get_db)):
    """公开详情：只返回可见公告（published 未过期），否则 404。站点更新（负 id）无详情。"""
    if ann_id < 0:
        raise HTTPException(status_code=404, detail="站点更新无详情", )
    a = db.get(Announcement, ann_id)
    if a is None or not _is_public_visible(a):
        raise HTTPException(status_code=404, detail="公告不存在或未发布", )
    out = AnnouncementOut.model_validate(a)
    if a.type == "update" and a.demo_slug:
        out.type = "demo_update"
    return out


@router.get("/admin/announcements/{ann_id}", response_model=AnnouncementOut)
def admin_get_announcement(
    ann_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """管理端详情：任意状态可见。"""
    if ann_id < 0:
        raise HTTPException(status_code=404, detail="站点更新无详情", )
    a = db.get(Announcement, ann_id)
    if a is None:
        raise HTTPException(status_code=404, detail="公告不存在", )
    return a


@router.get("/admin/announcements", response_model=list[AnnouncementOut])
def admin_list_announcements(
    status: str | None = Query(default=None, pattern="^(draft|published|offline)$"),
    category: str | None = None,
    pinned: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(Announcement)
    if status:
        q = q.filter(Announcement.status == status)
    if category:
        q = q.filter(Announcement.category == category)
    if pinned is not None:
        q = q.filter(Announcement.pinned == pinned)
    return q.order_by(Announcement.pinned.desc(), Announcement.created_at.desc(), Announcement.id.desc()).all()


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
        pinned=body.pinned,
        status=body.status,
        category=body.category,
        published_at=body.published_at,
        expires_at=body.expires_at,
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
    ann.pinned = body.pinned
    ann.status = body.status
    ann.category = body.category
    ann.published_at = body.published_at
    ann.expires_at = body.expires_at
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
