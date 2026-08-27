"""社区互动：赞/感谢、声望、关注、用户聚合。

- 赞（like）+1 声望，感谢（thanks）+2 声望；
- 取消互动后声望扣回；
- 关注关系用于用户主页与「只看关注」的论坛过滤。
"""

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, ForumReaction, ForumReply, ForumTopic, User, UserFollow
from ..schemas import (
    FollowOut,
    ReactionSummary,
    ReactionToggleOut,
    UserLeaderboardOut,
    UserLeaderboardPage,
    UserProfileOut,
)
from . import notification_service

REACTION_POINTS = {"like": 1, "thanks": 2}


def _reaction_target(db: Session, target_type: str, target_id: int):
    """返回可被互动的目标；不存在/不可见时抛 404。"""
    if target_type == "topic":
        t = db.get(ForumTopic, target_id)
        if t is None or t.status != "normal":
            raise HTTPException(status_code=404, detail="主题不存在或未上线")
        return t
    r = db.get(ForumReply, target_id)
    if r is None or r.status != "normal":
        raise HTTPException(status_code=404, detail="回复不存在或未上线")
    topic = db.get(ForumTopic, r.topic_id)
    if topic is None or topic.status != "normal":
        raise HTTPException(status_code=404, detail="回复不存在或未上线")
    return r


def reaction_summary(
    db: Session,
    target_type: str,
    target_id: int,
    user_id: int | None = None,
) -> ReactionSummary:
    rows = (
        db.query(ForumReaction.reaction_type, func.count(ForumReaction.id))
        .filter(
            ForumReaction.target_type == target_type,
            ForumReaction.target_id == target_id,
        )
        .group_by(ForumReaction.reaction_type)
        .all()
    )
    counts = {reaction_type: count for reaction_type, count in rows}
    my_reactions: list[str] = []
    if user_id is not None:
        my_reactions = [
            r.reaction_type
            for r in db.query(ForumReaction)
            .filter(
                ForumReaction.user_id == user_id,
                ForumReaction.target_type == target_type,
                ForumReaction.target_id == target_id,
            )
            .all()
        ]
    return ReactionSummary(
        target_type=target_type,
        target_id=target_id,
        like_count=counts.get("like", 0),
        thanks_count=counts.get("thanks", 0),
        my_reactions=my_reactions,
    )


def visible_reaction_summary(
    db: Session,
    target_type: str,
    target_id: int,
    user_id: int | None = None,
) -> ReactionSummary:
    """公开查询用：先校验目标可见，再返回互动汇总。"""
    _reaction_target(db, target_type, target_id)
    return reaction_summary(db, target_type, target_id, user_id)


def toggle_reaction(
    db: Session,
    user: User,
    target_type: str,
    target_id: int,
    reaction_type: str,
) -> ReactionToggleOut:
    target = _reaction_target(db, target_type, target_id)
    target_author_id = target.author_id
    if target_author_id == user.id:
        raise HTTPException(status_code=400, detail="不能给自己的内容点赞/感谢")

    points = REACTION_POINTS[reaction_type]
    existing = (
        db.query(ForumReaction)
        .filter(
            ForumReaction.user_id == user.id,
            ForumReaction.target_type == target_type,
            ForumReaction.target_id == target_id,
            ForumReaction.reaction_type == reaction_type,
        )
        .first()
    )

    notify_topic_id = None
    notify_reply_id = None
    if existing:
        db.delete(existing)
        if target_author_id:
            author = db.get(User, target_author_id)
            if author:
                if author.reputation >= points:
                    author.reputation -= points
                if reaction_type == "like" and author.received_likes > 0:
                    author.received_likes -= 1
                elif reaction_type == "thanks" and author.received_thanks > 0:
                    author.received_thanks -= 1
        active = False
    else:
        db.add(ForumReaction(
            user_id=user.id,
            target_type=target_type,
            target_id=target_id,
            reaction_type=reaction_type,
        ))
        if target_author_id:
            author = db.get(User, target_author_id)
            if author:
                author.reputation += points
                if reaction_type == "like":
                    author.received_likes += 1
                else:
                    author.received_thanks += 1
        active = True
        if target_type == "topic":
            notify_topic_id = target_id
        else:
            notify_topic_id = target.topic_id
            notify_reply_id = target_id

    db.commit()

    # 通知目标作者（独立事务，失败静默；仅在新增时通知）
    if active and target_author_id:
        notification_service.create(
            user_id=target_author_id,
            type="forum_reaction",
            actor_id=user.id,
            topic_id=notify_topic_id,
            reply_id=notify_reply_id,
        )

    summary = reaction_summary(db, target_type, target_id, user.id)
    return ReactionToggleOut(**summary.model_dump(), active=active)


def follow_counts(db: Session, user_id: int) -> tuple[int, int]:
    followers = db.query(UserFollow).filter(UserFollow.following_id == user_id).count()
    following = db.query(UserFollow).filter(UserFollow.follower_id == user_id).count()
    return followers, following


def toggle_follow(db: Session, follower: User, following_id: int) -> FollowOut:
    if follower.id == following_id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    target = db.get(User, following_id)
    if target is None or target.status != "active":
        raise HTTPException(status_code=404, detail="用户不存在或不可关注")

    existing = (
        db.query(UserFollow)
        .filter(UserFollow.follower_id == follower.id, UserFollow.following_id == following_id)
        .first()
    )
    if existing:
        db.delete(existing)
        following = False
    else:
        db.add(UserFollow(follower_id=follower.id, following_id=following_id))
        following = True
    db.commit()
    followers_count, following_count = follow_counts(db, following_id)
    return FollowOut(
        following=following,
        followers_count=followers_count,
        following_count=following_count,
    )


def user_profile(db: Session, username: str, viewer_id: int | None = None) -> UserProfileOut:
    user = db.query(User).filter(User.username == username).first()
    if user is None or user.status == "deleted":
        raise HTTPException(status_code=404, detail="用户不存在")

    demo_count = db.query(Demo).filter(Demo.author_id == user.id, Demo.status == "approved").count()
    topic_count = (
        db.query(ForumTopic)
        .filter(ForumTopic.author_id == user.id, ForumTopic.status == "normal")
        .count()
    )
    reply_count = (
        db.query(ForumReply)
        .filter(ForumReply.author_id == user.id, ForumReply.status == "normal")
        .count()
    )
    follower_count, following_count = follow_counts(db, user.id)
    is_following = False
    if viewer_id is not None and viewer_id != user.id:
        is_following = (
            db.query(UserFollow)
            .filter(UserFollow.follower_id == viewer_id, UserFollow.following_id == user.id)
            .first()
            is not None
        )
    return UserProfileOut(
        id=user.id,
        username=user.username,
        role=user.role,
        status=user.status,
        bio=user.bio,
        created_at=user.created_at,
        reputation=user.reputation,
        demo_count=demo_count,
        topic_count=topic_count,
        reply_count=reply_count,
        follower_count=follower_count,
        following_count=following_count,
        is_following=is_following,
        is_self=viewer_id == user.id,
    )


def list_followers(db: Session, user_id: int) -> list[User]:
    return (
        db.query(User)
        .join(UserFollow, UserFollow.follower_id == User.id)
        .filter(UserFollow.following_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .all()
    )


def list_following(db: Session, user_id: int) -> list[User]:
    return (
        db.query(User)
        .join(UserFollow, UserFollow.following_id == User.id)
        .filter(UserFollow.follower_id == user_id)
        .order_by(UserFollow.created_at.desc())
        .all()
    )


def delete_reactions_for_topic(db: Session, topic_id: int) -> None:
    """删除主题及其所有回复上的互动（管理端删主题时清理孤儿数据）。"""
    reply_ids = [rid for (rid,) in db.query(ForumReply.id).filter(ForumReply.topic_id == topic_id).all()]
    db.query(ForumReaction).filter(
        ForumReaction.target_type == "topic",
        ForumReaction.target_id == topic_id,
    ).delete(synchronize_session=False)
    if reply_ids:
        db.query(ForumReaction).filter(
            ForumReaction.target_type == "reply",
            ForumReaction.target_id.in_(reply_ids),
        ).delete(synchronize_session=False)


def delete_reactions_for_reply_tree(db: Session, reply_id: int) -> None:
    """删除回复及其所有子孙回复上的互动（管理端删回复时清理孤儿数据）。"""
    ids = [reply_id]
    queue = [reply_id]
    while queue:
        parent_id = queue.pop()
        child_ids = [
            rid
            for (rid,) in db.query(ForumReply.id).filter(ForumReply.parent_id == parent_id).all()
        ]
        ids.extend(child_ids)
        queue.extend(child_ids)
    db.query(ForumReaction).filter(
        ForumReaction.target_type == "reply",
        ForumReaction.target_id.in_(ids),
    ).delete(synchronize_session=False)


def user_leaderboard(
    db: Session,
    sort: str,
    page: int,
    page_size: int,
) -> UserLeaderboardPage:
    """用户排行榜：按声望/获赞/感谢/发帖/回复/作品/粉丝排序（仅 active 用户）。"""
    users = db.query(User).filter(User.status == "active").all()

    demo_counts = dict(
        db.query(Demo.author_id, func.count(Demo.id))
        .filter(Demo.status == "approved", Demo.author_id.isnot(None))
        .group_by(Demo.author_id)
        .all()
    )
    topic_counts = dict(
        db.query(ForumTopic.author_id, func.count(ForumTopic.id))
        .filter(ForumTopic.status == "normal", ForumTopic.author_id.isnot(None))
        .group_by(ForumTopic.author_id)
        .all()
    )
    reply_counts = dict(
        db.query(ForumReply.author_id, func.count(ForumReply.id))
        .filter(ForumReply.status == "normal", ForumReply.author_id.isnot(None))
        .group_by(ForumReply.author_id)
        .all()
    )
    follower_counts = dict(
        db.query(UserFollow.following_id, func.count(UserFollow.id))
        .group_by(UserFollow.following_id)
        .all()
    )

    rows = [
        UserLeaderboardOut(
            id=u.id,
            username=u.username,
            bio=u.bio,
            reputation=u.reputation,
            received_likes=u.received_likes,
            received_thanks=u.received_thanks,
            demo_count=demo_counts.get(u.id, 0),
            topic_count=topic_counts.get(u.id, 0),
            reply_count=reply_counts.get(u.id, 0),
            follower_count=follower_counts.get(u.id, 0),
        )
        for u in users
    ]

    if sort == "likes":
        key = lambda r: r.received_likes  # noqa: E731
    elif sort == "thanks":
        key = lambda r: r.received_thanks  # noqa: E731
    elif sort == "topics":
        key = lambda r: r.topic_count  # noqa: E731
    elif sort == "replies":
        key = lambda r: r.reply_count  # noqa: E731
    elif sort == "demos":
        key = lambda r: r.demo_count  # noqa: E731
    elif sort == "followers":
        key = lambda r: r.follower_count  # noqa: E731
    else:
        key = lambda r: r.reputation  # noqa: E731

    rows.sort(key=lambda r: (key(r), r.id), reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    return UserLeaderboardPage(
        items=rows[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
    )
