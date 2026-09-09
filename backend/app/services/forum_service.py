"""论坛业务：序列化、可见性、链接校验、新用户审核判定。"""

import ipaddress
import re
import socket
import urllib.parse

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import ForumReply, ForumTopic, User
from ..schemas import ForumReplyOut, ForumTopicOut
from . import community_service

# 链接域名黑名单
BLOCKED_DOMAINS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "example.com", "test"}
_URL_RE = re.compile(r"https?://[^\s<>\"'()]+")


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


def needs_review(user: User) -> bool:
    return user.need_review or user.trust_level < 1
