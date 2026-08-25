"""论坛：主题 + 回复。发帖/回复需登录；匿名可读；管理端可管 hidden/置顶/加精。"""

import time
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..models import Demo, ForumReply, ForumTopic, User
from ..schemas import (
    ForumReplyIn,
    ForumReplyOut,
    ForumTopicAdminUpdate,
    ForumTopicIn,
    ForumTopicOut,
    Paginated,
)

router = APIRouter(prefix="/forum", tags=["forum"])

# 发帖/回复限流：每用户每 IP 每小时 N 次
_post_hits: dict[str, list[float]] = defaultdict(list)
_TOPIC_RATE = 10
_REPLY_RATE = 30


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _rate_limit(request: Request, key: str, limit: int) -> None:
    ip = _client_ip(request)
    now = time.time()
    bucket = f"{key}:{ip}"
    _post_hits[bucket] = [t for t in _post_hits[bucket] if t > now - 3600]
    if len(_post_hits[bucket]) >= limit:
        raise HTTPException(status_code=429, detail=f"操作过于频繁（每 IP 每小时 {limit} 次）", )
    _post_hits[bucket].append(now)


def _topic_out(t: ForumTopic) -> ForumTopicOut:
    author = t.author.username if t.author else None
    tags = [x.strip() for x in t.tags.split(",") if x.strip()]
    return ForumTopicOut(
        id=t.id,
        title=t.title,
        content=t.content,
        author=author,
        author_id=t.author_id,
        demo_slug=t.demo_slug,
        category=t.category,
        tags=tags,
        pinned=t.pinned,
        sticky=t.sticky,
        status=t.status,
        reply_count=t.reply_count,
        view_count=t.view_count,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _reply_out(r: ForumReply) -> ForumReplyOut:
    return ForumReplyOut(
        id=r.id,
        topic_id=r.topic_id,
        author=r.author.username if r.author else None,
        author_id=r.author_id,
        content=r.content,
        created_at=r.created_at,
    )


def _find_visible_topic(db: Session, tid: int) -> ForumTopic:
    t = db.get(ForumTopic, tid)
    if t is None or t.status != "normal":
        raise HTTPException(status_code=404, detail="主题不存在或已隐藏", )
    return t


# ---------- 公开 ----------
@router.get("/topics", response_model=Paginated)
def list_topics(
    q: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    demo: str | None = None,
    sort: str = Query(default="newest", pattern="^(newest|popular)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(ForumTopic).filter(ForumTopic.status == "normal")
    if q:
        like = f"%{q}%"
        query = query.filter((ForumTopic.title.ilike(like)) | (ForumTopic.content.ilike(like)))
    if category:
        query = query.filter(ForumTopic.category == category)
    if tag:
        query = query.filter(ForumTopic.tags.ilike(f"%{tag}%"))
    if demo:
        query = query.filter(ForumTopic.demo_slug == demo)

    if sort == "popular":
        query = query.order_by(ForumTopic.view_count.desc(), ForumTopic.created_at.desc(), ForumTopic.id.desc())
    else:
        query = query.order_by(
            ForumTopic.pinned.desc(), ForumTopic.sticky.desc(), ForumTopic.created_at.desc(), ForumTopic.id.desc()
        )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_topic_out(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/topics/{tid}", response_model=ForumTopicOut)
def get_topic(tid: int, db: Session = Depends(get_db)):
    t = _find_visible_topic(db, tid)
    t.view_count += 1
    db.commit()
    db.refresh(t)
    return _topic_out(t)


@router.get("/topics/{tid}/replies", response_model=list[ForumReplyOut])
def list_replies(tid: int, db: Session = Depends(get_db)):
    _find_visible_topic(db, tid)
    rows = (
        db.query(ForumReply)
        .filter(ForumReply.topic_id == tid)
        .order_by(ForumReply.created_at, ForumReply.id)
        .all()
    )
    return [_reply_out(r) for r in rows]


# ---------- 登录 ----------
@router.post("/topics", status_code=201, response_model=ForumTopicOut)
def create_topic(
    body: ForumTopicIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    _rate_limit(request, "topic", _TOPIC_RATE)
    if body.demo_slug:
        demo = db.query(Demo).filter(Demo.slug == body.demo_slug, Demo.status == "approved").first()
        if demo is None:
            raise HTTPException(status_code=422, detail="关联 demo 不存在或未上线", )
    t = ForumTopic(
        title=body.title,
        content=body.content,
        author_id=user.id,
        demo_slug=body.demo_slug,
        category=body.category,
        tags=body.tags,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _topic_out(t)


@router.post("/topics/{tid}/replies", status_code=201, response_model=ForumReplyOut)
def create_reply(
    tid: int,
    body: ForumReplyIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    t = _find_visible_topic(db, tid)
    _rate_limit(request, "reply", _REPLY_RATE)
    r = ForumReply(topic_id=t.id, author_id=user.id, content=body.content)
    db.add(r)
    t.reply_count += 1
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return _reply_out(r)


# ---------- 管理 ----------
@router.get("/admin/topics", response_model=Paginated)
def admin_list_topics(
    q: str | None = None,
    status: str | None = Query(default=None, pattern="^(normal|hidden)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(ForumTopic)
    if q:
        like = f"%{q}%"
        query = query.filter((ForumTopic.title.ilike(like)) | (ForumTopic.content.ilike(like)))
    if status:
        query = query.filter(ForumTopic.status == status)
    total = query.count()
    items = query.order_by(ForumTopic.created_at.desc(), ForumTopic.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_topic_out(t) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/admin/topics/{tid}", response_model=ForumTopicOut)
def admin_update_topic(
    tid: int,
    body: ForumTopicAdminUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    t = db.get(ForumTopic, tid)
    if t is None:
        raise HTTPException(status_code=404, detail="主题不存在", )
    if body.pinned is not None:
        t.pinned = body.pinned
    if body.sticky is not None:
        t.sticky = body.sticky
    if body.category is not None:
        t.category = body.category
    if body.status is not None:
        t.status = body.status
    db.commit()
    db.refresh(t)
    return _topic_out(t)


@router.delete("/admin/topics/{tid}", status_code=204)
def admin_delete_topic(tid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.get(ForumTopic, tid)
    if t is None:
        raise HTTPException(status_code=404, detail="主题不存在", )
    db.delete(t)  # replies 级联删除
    db.commit()
    return None


@router.delete("/admin/replies/{rid}", status_code=204)
def admin_delete_reply(rid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    r = db.get(ForumReply, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="回复不存在", )
    topic = db.get(ForumTopic, r.topic_id)
    db.delete(r)
    if topic is not None and topic.reply_count > 0:
        topic.reply_count -= 1
    db.commit()
    return None
