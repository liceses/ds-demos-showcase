"""一次性脚本：把历史 comments 归集为论坛回复（按 demo_id 建主题）。

用法（web/ 目录下）：
    python scripts/migrate_comments_to_forum.py

幂等：已存在同 demo_slug 的论坛主题则跳过该 demo。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import Comment, Demo, ForumReply, ForumTopic  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        demo_ids = [cid for (cid,) in db.query(Comment.demo_id).distinct().all()]
        created_topics = 0
        created_replies = 0
        for demo_id in demo_ids:
            demo = db.get(Demo, demo_id)
            if demo is None:
                continue
            # 幂等：已有该 demo 的主题则跳过
            if db.query(ForumTopic).filter(ForumTopic.demo_slug == demo.slug).first():
                continue
            topic = ForumTopic(
                title=f"{demo.title} 的讨论",
                content="历史评论迁移",
                author_id=demo.author_id,
                demo_slug=demo.slug,
                category="demo",
                status="normal",
            )
            db.add(topic)
            db.flush()
            comments = (
                db.query(Comment)
                .filter(Comment.demo_id == demo_id)
                .order_by(Comment.created_at, Comment.id)
                .all()
            )
            for c in comments:
                db.add(ForumReply(
                    topic_id=topic.id,
                    author_id=c.user_id,
                    content=c.content,
                    status="normal",
                ))
                topic.reply_count += 1
                created_replies += 1
            created_topics += 1
        db.commit()
        print(f"完成：迁移 {created_topics} 个主题，{created_replies} 条回复")
    finally:
        db.close()


if __name__ == "__main__":
    main()
