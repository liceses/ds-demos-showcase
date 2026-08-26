"""论坛：主题 + 回复。发帖/回复需登录；匿名可读；新用户进审核；管理端可管 hidden/reviewing/封禁/举报。"""

import time
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, optional_user, require_admin
from ..models import Announcement, Demo, ForumReply, ForumReport, ForumTopic, User, UserFollow
from ..schemas import (
    ForumReplyIn,
    ForumReplyOut,
    ForumReplyPage,
    ForumReportHandleIn,
    ForumReportIn,
    ForumReportOut,
    ForumReviewIn,
    ForumTopicAdminUpdate,
    ForumTopicIn,
    ForumTopicOut,
    ForumTopicPage,
    ReactionSummary,
    ReactionToggleIn,
    ReactionToggleOut,
)
from ..services import community_service, forum_service, notification_service

router = APIRouter(prefix="/forum", tags=["forum"])

# 发帖/回复限流：用户 + IP 双维度
_hits: dict[str, list[float]] = defaultdict(list)
_TOPIC_RATE = 10
_REPLY_RATE = 30


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _rate_limit(request: Request, key: str, limit: int, user: User) -> None:
    ip = _client_ip(request)
    now = time.time()
    buckets = (f"{key}:{user.id}", f"{key}:{ip}")
    for bucket in buckets:
        _hits[bucket] = [t for t in _hits[bucket] if t > now - 3600]
    for bucket in buckets:
        if len(_hits[bucket]) >= limit:
            oldest = _hits[bucket][0] if _hits[bucket] else now
            wait = max(1, int(3600 - (now - oldest)))
            raise HTTPException(
                status_code=429,
                detail=f"操作过于频繁（每 IP/用户每小时 {limit} 次），请 {wait} 秒后重试",
                headers={"Retry-After": str(wait)},
            )
    for bucket in buckets:
        _hits[bucket].append(now)


# ---------- 公开 ----------
@router.get("/topics", response_model=ForumTopicPage)
def list_topics(
    q: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    demo: str | None = None,
    sort: str = Query(default="newest", pattern="^(newest|popular|replies|hot)$"),
    sticky: bool = Query(False),
    participated: bool = Query(False),
    followed: bool = Query(False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
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
    if sticky:
        query = query.filter(ForumTopic.sticky == True)  # noqa: E712
    if participated:
        if user is None:
            return ForumTopicPage(items=[], total=0, page=page, page_size=page_size)
        my_topic_ids = db.query(ForumReply.topic_id).filter(ForumReply.author_id == user.id).distinct()
        query = query.filter(ForumTopic.id.in_(my_topic_ids))
    if followed:
        if user is None:
            return ForumTopicPage(items=[], total=0, page=page, page_size=page_size)
        followed_ids = db.query(UserFollow.following_id).filter(UserFollow.follower_id == user.id)
        query = query.filter(ForumTopic.author_id.in_(followed_ids))

    if sort == "popular":
        query = query.order_by(ForumTopic.view_count.desc(), ForumTopic.created_at.desc(), ForumTopic.id.desc())
    elif sort == "replies":
        query = query.order_by(ForumTopic.reply_count.desc(), ForumTopic.created_at.desc(), ForumTopic.id.desc())
    elif sort == "hot":
        # 热度 = 回复数 + 浏览/50 + 时间衰减（时间衰减用 created_at 兜底）
        query = query.order_by(
            (ForumTopic.reply_count + ForumTopic.view_count / 50.0).desc(),
            ForumTopic.created_at.desc(),
            ForumTopic.id.desc(),
        )
    else:
        query = query.order_by(
            ForumTopic.pinned.desc(), ForumTopic.sticky.desc(), ForumTopic.created_at.desc(), ForumTopic.id.desc()
        )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    viewer_id = user.id if user else None
    return ForumTopicPage(
        items=[forum_service.topic_out(t, db, viewer_id) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/topics/{tid}", response_model=ForumTopicOut)
def get_topic(
    tid: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    t = forum_service.find_visible_topic(db, tid)
    t.view_count += 1
    db.commit()
    db.refresh(t)
    return forum_service.topic_out(t, db, user.id if user else None)


@router.get("/topics/{tid}/replies", response_model=ForumReplyPage)
def list_replies(
    tid: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    forum_service.find_visible_topic(db, tid)
    q = db.query(ForumReply).filter(ForumReply.topic_id == tid, ForumReply.status == "normal")
    total = q.count()
    rows = (
        q.order_by(ForumReply.created_at, ForumReply.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    viewer_id = user.id if user else None
    return ForumReplyPage(
        items=[forum_service.reply_out(r, db, viewer_id) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------- 互动（赞/感谢） ----------
@router.get("/reactions/summary", response_model=ReactionSummary)
def get_reaction_summary(
    target_type: str = Query(pattern="^(topic|reply)$"),
    target_id: int = Query(ge=1),
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    return community_service.visible_reaction_summary(db, target_type, target_id, user.id if user else None)


@router.post("/reactions", response_model=ReactionToggleOut)
def toggle_reaction(
    body: ReactionToggleIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return community_service.toggle_reaction(db, user, body.target_type, body.target_id, body.reaction_type)


# ---------- 登录 ----------
@router.post("/topics", status_code=201, response_model=ForumTopicOut)
def create_topic(
    body: ForumTopicIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    _rate_limit(request, "topic", _TOPIC_RATE, user)
    forum_service.validate_links(body.content)
    if body.demo_slug:
        demo = db.query(Demo).filter(Demo.slug == body.demo_slug, Demo.status == "approved").first()
        if demo is None:
            raise HTTPException(status_code=422, detail="关联 demo 不存在或未上线", )
    status = "reviewing" if forum_service.needs_review(user) else "normal"
    t = ForumTopic(
        title=body.title,
        content=body.content,
        author_id=user.id,
        demo_slug=body.demo_slug,
        category=body.category,
        tags=body.tags,
        status=status,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return forum_service.topic_out(t, db, user.id)


@router.post("/topics/{tid}/replies", status_code=201, response_model=ForumReplyOut)
def create_reply(
    tid: int,
    body: ForumReplyIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    t = forum_service.find_visible_topic(db, tid)
    if t.locked:
        raise HTTPException(status_code=403, detail="该主题已关闭讨论", )
    _rate_limit(request, "reply", _REPLY_RATE, user)
    forum_service.validate_links(body.content)
    parent_id = None
    if body.parent_id is not None:
        parent = db.get(ForumReply, body.parent_id)
        if parent is None or parent.topic_id != t.id or parent.status != "normal":
            raise HTTPException(status_code=422, detail="父回复不存在或不属于该主题", )
        parent_id = parent.id
    status = "reviewing" if forum_service.needs_review(user) else "normal"
    r = ForumReply(topic_id=t.id, author_id=user.id, content=body.content, status=status, parent_id=parent_id)
    db.add(r)
    if status == "normal":
        t.reply_count += 1
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    # 通知：主题作者（非本人）+ @提及用户
    if t.author_id and t.author_id != user.id:
        notification_service.create(
            user_id=t.author_id,
            type="forum_reply",
            actor_id=user.id,
            topic_id=t.id,
            reply_id=r.id,
        )
    exclude = {user.id, t.author_id or -1}
    notification_service.notify_mentions(body.content, user.id, t.id, r.id, exclude)
    return forum_service.reply_out(r, db, user.id)


# ---------- 举报 ----------
@router.post("/reports", status_code=201, response_model=ForumReportOut)
def create_report(
    body: ForumReportIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    _rate_limit(request, "report", 20, user)
    r = ForumReport(
        target_type=body.target_type,
        target_id=body.target_id,
        reporter_id=user.id,
        reason=body.reason,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# ---------- 管理 ----------
@router.get("/admin/topics", response_model=ForumTopicPage)
def admin_list_topics(
    q: str | None = None,
    status: str | None = Query(default=None, pattern="^(normal|hidden|reviewing)$"),
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
    return ForumTopicPage(
        items=[forum_service.topic_out(t, db) for t in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/admin/replies", response_model=list[ForumReplyOut])
def admin_list_replies(
    topic_id: int | None = None,
    status: str | None = Query(default=None, pattern="^(normal|hidden|reviewing)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """管理端回复列表：可按主题/状态过滤（含 hidden/reviewing）。"""
    q = db.query(ForumReply)
    if topic_id is not None:
        q = q.filter(ForumReply.topic_id == topic_id)
    if status:
        q = q.filter(ForumReply.status == status)
    rows = q.order_by(ForumReply.created_at.desc(), ForumReply.id.desc()).all()
    return [forum_service.reply_out(r, db) for r in rows]


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
    if body.title is not None:
        t.title = body.title
    if body.tags is not None:
        t.tags = body.tags
    if body.pinned is not None:
        t.pinned = body.pinned
    if body.sticky is not None:
        t.sticky = body.sticky
    if body.locked is not None:
        t.locked = body.locked
    if body.solved is not None:
        t.solved = body.solved
    if body.category is not None:
        t.category = body.category
    if body.status is not None:
        t.status = body.status
    db.commit()
    db.refresh(t)
    return forum_service.topic_out(t, db)


@router.post("/admin/topics/{tid}/review", response_model=ForumTopicOut)
def admin_review_topic(
    tid: int,
    body: ForumReviewIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    t = db.get(ForumTopic, tid)
    if t is None or t.status != "reviewing":
        raise HTTPException(status_code=404, detail="主题不存在或不在审核中", )
    if body.action == "approve":
        t.status = "normal"
        if t.author and (t.author.need_review or t.author.trust_level < 1):
            t.author.trust_level = 1
            t.author.need_review = False
    else:
        t.status = "hidden"
    db.commit()
    db.refresh(t)
    return forum_service.topic_out(t, db)


@router.post("/admin/replies/{rid}/review", response_model=ForumReplyOut)
def admin_review_reply(
    rid: int,
    body: ForumReviewIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    r = db.get(ForumReply, rid)
    if r is None or r.status != "reviewing":
        raise HTTPException(status_code=404, detail="回复不存在或不在审核中", )
    if body.action == "approve":
        r.status = "normal"
        topic = db.get(ForumTopic, r.topic_id)
        if topic:
            topic.reply_count += 1
        if r.author and (r.author.need_review or r.author.trust_level < 1):
            r.author.trust_level = 1
            r.author.need_review = False
    else:
        r.status = "hidden"
    db.commit()
    db.refresh(r)
    return forum_service.reply_out(r, db)


@router.delete("/admin/topics/{tid}", status_code=204)
def admin_delete_topic(tid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = db.get(ForumTopic, tid)
    if t is None:
        raise HTTPException(status_code=404, detail="主题不存在", )
    db.query(Announcement).filter(Announcement.topic_id == tid).update({Announcement.topic_id: None})
    community_service.delete_reactions_for_topic(db, tid)
    db.delete(t)  # replies 级联删除
    db.commit()
    return None


@router.delete("/admin/replies/{rid}", status_code=204)
def admin_delete_reply(rid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    r = db.get(ForumReply, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="回复不存在", )
    topic = db.get(ForumTopic, r.topic_id)
    community_service.delete_reactions_for_reply_tree(db, rid)
    db.delete(r)
    if r.status == "normal" and topic is not None and topic.reply_count > 0:
        topic.reply_count -= 1
    db.commit()
    return None


@router.post("/admin/users/{uid}/ban", status_code=204)
def admin_ban_user(uid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(status_code=404, detail="用户不存在", )
    if u.role == "admin":
        raise HTTPException(status_code=400, detail="不能封禁管理员", )
    u.status = "banned"
    db.commit()
    return None


@router.get("/admin/reports", response_model=list[ForumReportOut])
def admin_list_reports(
    status: str | None = Query(default=None, pattern="^(open|resolved|dismissed)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(ForumReport)
    if status:
        q = q.filter(ForumReport.status == status)
    return q.order_by(ForumReport.created_at.desc()).all()


@router.post("/admin/reports/{rid}/handle", response_model=ForumReportOut)
def admin_handle_report(
    rid: int,
    body: ForumReportHandleIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    r = db.get(ForumReport, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="举报不存在", )
    r.status = "resolved" if body.action == "resolve" else "dismissed"
    db.commit()
    db.refresh(r)
    if r.reporter_id:
        notification_service.create(
            user_id=r.reporter_id,
            type="report_handled",
            actor_id=admin.id,
            topic_id=r.target_id if r.target_type == "topic" else None,
            reply_id=r.target_id if r.target_type == "reply" else None,
        )
    return r
