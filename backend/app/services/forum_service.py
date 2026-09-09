"""论坛业务：序列化、可见性、链接校验、新用户审核判定。"""

import ipaddress
import re
import socket
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import ForumReply, ForumTopic, User
from ..schemas import ForumReplyOut, ForumTopicOut
from . import community_service

# 链接域名黑名单
BLOCKED_DOMAINS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "test"}
_URL_RE = re.compile(r"https?://[^\s<>\"'()]+")

# ---- 域名解析（KB-24）----
# 旧实现直接在请求线程里 socket.getaddrinfo 且无超时：登录用户贴一个慢解析域名就能
# 占住一个 threadpool 槽数秒，几十个并发即可拖慢全站。这里改成：小线程池 + 1s 超时 +
# 正/负结果 TTL 缓存 + 并发闸（通道繁忙时按 fail-closed 处理，不排队）。
_DNS_TIMEOUT = 1.0
_DNS_TTL = 300.0
_DNS_MAX_ENTRIES = 5000
_dns_lock = threading.Lock()
_dns_cache: dict[str, tuple[float, bool | None]] = {}
_dns_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="forum-dns")
_dns_sem = threading.BoundedSemaphore(4)


def _host_verdict(host: str) -> bool | None:
    """True=内网/保留地址，False=公网，None=解析失败/超时（调用方按 fail-closed 处理）。"""
    now = time.time()
    with _dns_lock:
        hit = _dns_cache.get(host)
        if hit and hit[0] > now:
            return hit[1]

    verdict: bool | None = None
    if not _dns_sem.acquire(blocking=False):
        verdict = None  # 解析通道繁忙：不排队，直接按无法确认处理
    else:
        try:
            infos = _dns_pool.submit(socket.getaddrinfo, host, None).result(timeout=_DNS_TIMEOUT)
        except (FutureTimeout, socket.gaierror, OSError, UnicodeError):
            verdict = None
        else:
            verdict = False
            for info in infos:
                try:
                    ip = ipaddress.ip_address(info[4][0])
                except ValueError:
                    continue
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    verdict = True
                    break
        finally:
            _dns_sem.release()

    with _dns_lock:
        if len(_dns_cache) >= _DNS_MAX_ENTRIES:  # 有界：满了先丢最早的一批
            for key in list(_dns_cache)[: _DNS_MAX_ENTRIES // 5]:
                _dns_cache.pop(key, None)
        _dns_cache[host] = (now + _DNS_TTL, verdict)
    return verdict


def reply_subtree_ids(db: Session, root_id: int) -> list[int]:
    """回复子树的 id 集合（含自身）。

    KB-18：`forum_replies.parent_id` 带 `ondelete=CASCADE`，删父回复会连带删掉整棵子树，
    计数器必须按子树里 normal 回复的条数扣减，而不是固定 -1。
    """
    ids = [root_id]
    frontier = [root_id]
    guard = 0
    while frontier and guard < 50:  # 深度上限：正常嵌套远小于此，防脏数据成环
        guard += 1
        children = [
            row[0]
            for row in db.query(ForumReply.id).filter(ForumReply.parent_id.in_(frontier)).all()
        ]
        children = [c for c in children if c not in ids]
        ids.extend(children)
        frontier = children
    return ids


def topic_out(
    t: ForumTopic,
    db: Session | None = None,
    user_id: int | None = None,
    summary=None,
) -> ForumTopicOut:
    """主题序列化。KB-19：列表页传入预算好的 `summary`（批量汇总），单条场景才现查。"""
    author = t.author.username if t.author else None
    tags = [x.strip() for x in t.tags.split(",") if x.strip()]
    like_count = 0
    thanks_count = 0
    my_reactions: list[str] = []
    if summary is None and db is not None:
        summary = community_service.reaction_summary(db, "topic", t.id, user_id)
    if summary is not None:
        like_count = summary.like_count
        thanks_count = summary.thanks_count
        my_reactions = summary.my_reactions
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
        locked=t.locked,
        solved=t.solved,
        status=t.status,
        reply_count=t.reply_count,
        view_count=t.view_count,
        like_count=like_count,
        thanks_count=thanks_count,
        my_reactions=my_reactions,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def reply_out(
    r: ForumReply,
    db: Session | None = None,
    user_id: int | None = None,
    summary=None,
) -> ForumReplyOut:
    """回复序列化。KB-19：列表页传入预算好的 `summary`，避免逐行查互动。"""
    like_count = 0
    thanks_count = 0
    my_reactions: list[str] = []
    if summary is None and db is not None:
        summary = community_service.reaction_summary(db, "reply", r.id, user_id)
    if summary is not None:
        like_count = summary.like_count
        thanks_count = summary.thanks_count
        my_reactions = summary.my_reactions
    return ForumReplyOut(
        id=r.id,
        topic_id=r.topic_id,
        author=r.author.username if r.author else None,
        author_id=r.author_id,
        content=r.content,
        status=r.status,
        parent_id=r.parent_id,
        like_count=like_count,
        thanks_count=thanks_count,
        my_reactions=my_reactions,
        created_at=r.created_at,
    )


def find_visible_topic(db: Session, tid: int) -> ForumTopic:
    t = db.get(ForumTopic, tid)
    if t is None or t.status != "normal":
        raise HTTPException(status_code=404, detail="主题不存在或未上线", )
    return t


def validate_links(text: str) -> None:
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
        # 字面量 IP 直接判定；域名走带超时/缓存的解析（KB-24）
        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            verdict = _host_verdict(host)
            if verdict is True:
                raise HTTPException(status_code=422, detail="链接指向内网/回环/保留地址，禁止", )
            if verdict is None:
                raise HTTPException(status_code=422, detail=f"无法解析链接域名 {host}（超时或解析失败）", )
        else:
            if literal.is_private or literal.is_loopback or literal.is_link_local or literal.is_reserved:
                raise HTTPException(status_code=422, detail="链接指向内网/回环/保留地址，禁止", )


def validate_report_target(db: Session, target_type: str, target_id: int) -> None:
    """举报目标必须存在且可见（KB-25）：否则举报队列里堆的是指向空气的条目。"""
    if target_type == "topic":
        t = db.get(ForumTopic, target_id)
        if t is None or t.status == "hidden":
            raise HTTPException(status_code=404, detail="被举报的主题不存在", )
        return
    r = db.get(ForumReply, target_id)
    if r is None or r.status == "hidden":
        raise HTTPException(status_code=404, detail="被举报的回复不存在", )
    topic = db.get(ForumTopic, r.topic_id)
    if topic is None or topic.status == "hidden":
        raise HTTPException(status_code=404, detail="被举报的回复不存在", )


def needs_review(user: User) -> bool:
    return user.need_review or user.trust_level < 1
