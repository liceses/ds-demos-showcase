"""通知业务：创建通知（独立事务，失败静默不阻塞主流程）。"""

import re

from ..database import SessionLocal
from ..models import Notification, User

# @用户名 提及解析
_MENTION_RE = re.compile(r"@([A-Za-z0-9_\u4e00-\u9fa5]{1,32})")


def create(
    user_id: int,
    type: str,
    actor_id: int | None = None,
    demo_slug: str | None = None,
    topic_id: int | None = None,
    reply_id: int | None = None,
) -> None:
    """创建一条通知。独立 Session + 独立事务，失败静默。"""
    db = SessionLocal()
    try:
        db.add(Notification(
            user_id=user_id,
            type=type,
            actor_id=actor_id,
            demo_slug=demo_slug,
            topic_id=topic_id,
            reply_id=reply_id,
        ))
        db.commit()
    except Exception:  # noqa: BLE001 —— 通知失败不影响业务
        db.rollback()
    finally:
        db.close()


def notify_mentions(content: str, actor_id: int, topic_id: int, reply_id: int, exclude_ids: set[int]) -> None:
    """解析 @用户名 并通知被提及用户（排除自己/主题作者）。"""
    db = SessionLocal()
    try:
        names = set(_MENTION_RE.findall(content or ""))
        if not names:
            return
        users = db.query(User).filter(User.username.in_(names)).all()
        for u in users:
            if u.id in exclude_ids:
                continue
            db.add(Notification(
                user_id=u.id,
                type="forum_reply",
                actor_id=actor_id,
                topic_id=topic_id,
                reply_id=reply_id,
            ))
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
    finally:
        db.close()
