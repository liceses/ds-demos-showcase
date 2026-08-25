"""论坛：主题 + 回复。发帖/回复需登录；匿名可读；新用户进审核；管理端可管 hidden/reviewing/封禁/举报。"""

import ipaddress
import re
import socket
import time
import urllib.parse
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_admin
from ..models import Demo, ForumReply, ForumReport, ForumTopic, User
from ..schemas import (
    ForumReplyIn,
    ForumReplyOut,
    ForumReportHandleIn,
    ForumReportIn,
    ForumReportOut,
    ForumReviewIn,
    ForumTopicAdminUpdate,
    ForumTopicIn,
    ForumTopicOut,
    Paginated,
)

router = APIRouter(prefix="/forum", tags=["forum"])

# 发帖/回复限流：用户 + IP 双维度
_hits: dict[str, list[float]] = defaultdict(list)
_TOPIC_RATE = 10
_REPLY_RATE = 30

# 链接域名黑名单
BLOCKED_DOMAINS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "test"}
_URL_RE = re.compile(r"https?://[^\s<>\"'()]+")


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _rate_limit(request: Request, key: str, limit: int, user: User) -> None:
    ip = _client_ip(request)
    now = time.time()
    for bucket in (f"{key}:{user.id}", f"{key}:{ip}"):
        _hits[bucket] = [t for t in _hits[bucket] if t > now - 3600]
        if len(_hits[bucket]) >= limit:
            oldest = _hits[bucket][0] if _hits[bucket] else now
            wait = max(1, int(3600 - (now - oldest)))
            raise HTTPException(
                status_code=429,
                detail=f"操作过于频繁（每 IP/用户每小时 {limit} 次），请 {wait} 秒后重试",
                headers={"Retry-After": str(wait)},
            )
        _hits[bucket].append(now)


def _validate_links(text: str) -> None:
    """链接安全：只允许 http/https，拒绝内网/回环/保留地址，域名黑名单。"""
    for m in _URL_RE.finditer(text or ""):
        url = m.group(0).rstrip(".,;:!?)]}")
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise HTTPException(status_code=422, detail="只允许 http/https 链接", )
        host = parsed.hostname
        if not host:
            raise HTTPException(status_code=422, detail="无效链接", )
        if host.lower() in BLOCKED_DOMAINS:
            raise HTTPException(status_code=422, detail=f"域名 {host} 被列入黑名单", )
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            raise HTTPException(status_code=422, detail=f"无法解析链接域名 {host}", )
        for info in infos:
            try:
                ip = ipaddress.ip_address(info[4][0])
            except ValueError:
                continue
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise HTTPException(status_code=422, detail="链接指向内网/回环/保留地址，禁止", )


def _needs_review(user: User) -> bool:
    return user.need_review or user.trust_level < 1


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
        status=r.status,
        created_at=r.created_at,
    )


def _find_visible_topic(db: Session, tid: int) -> ForumTopic:
    t = db.get(ForumTopic, tid)
    if t is None or t.status != "normal":
        raise HTTPException(status_code=404, detail="主题不存在或未上线", )
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
        .filter(ForumReply.topic_id == tid, ForumReply.status == "normal")
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
    _rate_limit(request, "topic", _TOPIC_RATE, user)
    _validate_links(body.content)
    if body.demo_slug:
        demo = db.query(Demo).filter(Demo.slug == body.demo_slug, Demo.status == "approved").first()
        if demo is None:
            raise HTTPException(status_code=422, detail="关联 demo 不存在或未上线", )
    status = "reviewing" if _needs_review(user) else "normal"
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
    _rate_limit(request, "reply", _REPLY_RATE, user)
    _validate_links(body.content)
    status = "reviewing" if _needs_review(user) else "normal"
    r = ForumReply(topic_id=t.id, author_id=user.id, content=body.content, status=status)
    db.add(r)
    t.reply_count += 1
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return _reply_out(r)


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
@router.get("/admin/topics", response_model=Paginated)
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
    return Paginated(
        items=[_topic_out(t) for t in items],
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
    return [_reply_out(r) for r in rows]


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
    return _topic_out(t)


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
        if r.author and (r.author.need_review or r.author.trust_level < 1):
            r.author.trust_level = 1
            r.author.need_review = False
    else:
        r.status = "hidden"
        topic = db.get(ForumTopic, r.topic_id)
        if topic and topic.reply_count > 0:
            topic.reply_count -= 1
    db.commit()
    db.refresh(r)
    return _reply_out(r)


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
    _: User = Depends(require_admin),
):
    r = db.get(ForumReport, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="举报不存在", )
    r.status = "resolved" if body.action == "resolve" else "dismissed"
    db.commit()
    db.refresh(r)
    return r
