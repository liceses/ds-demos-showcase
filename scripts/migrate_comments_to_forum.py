"""一次性脚本：把历史 comments 归集为论坛回复（按 demo_id 建/复用主题）。

用法（web/ 目录下）：
    python scripts/migrate_comments_to_forum.py
容器内：
    docker compose exec backend python /site-repo/scripts/migrate_comments_to_forum.py

幂等：以 forum_replies.source_comment_id 去重；重复执行不会产生重复楼层。
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
        skipped = 0
        orphan_comments = 0
        skipped_non_approved = 0

        for demo_id in demo_ids:
            demo = db.get(Demo, demo_id)
            if demo is None:
                # 评论指向已不存在的 demo（孤儿评论）
                orphan_comments += db.query(Comment).filter(Comment.demo_id == demo_id).count()
                continue
            if demo.status != "approved":
                # 未上架 demo 的评论不生成公开主题，避免泄漏未上线内容
                skipped_non_approved += db.query(Comment).filter(Comment.demo_id == demo_id).count()
                continue

            comments = (
                db.query(Comment)
                .filter(Comment.demo_id == demo_id)
                .order_by(Comment.created_at, Comment.id)
                .all()
            )
            if not comments:
                continue

            # 创建/复用主题
            topic = db.query(ForumTopic).filter(ForumTopic.demo_slug == demo.slug).first()
            if topic is None:
                topic = ForumTopic(
                    title=f"{demo.title} 的讨论",
                    content="历史评论迁移",
                    author_id=demo.author_id,
                    demo_slug=demo.slug,
                    category="demo",
                    status="normal",
                    created_at=comments[0].created_at,
                    updated_at=comments[-1].created_at,
                )
                db.add(topic)
                db.flush()
                created_topics += 1

            # 迁移评论（source_comment_id 去重）
            for c in comments:
                if db.query(ForumReply).filter(ForumReply.source_comment_id == c.id).first():
                    skipped += 1
                    continue
                db.add(ForumReply(
                    topic_id=topic.id,
                    author_id=c.user_id,
                    content=c.content,
                    status="normal",
                    source_comment_id=c.id,
                    created_at=c.created_at,
                ))
                created_replies += 1

            # 重算 reply_count（幂等后也准确）
            topic.reply_count = (
                db.query(ForumReply).filter(ForumReply.topic_id == topic.id).count()
            )
            topic.updated_at = comments[-1].created_at

        db.commit()

        # 孤儿评论统计（comments 引用的 demo 已不存在）
        orphan_total = orphan_comments
        print(f"完成：新建主题 {created_topics} 个，迁移回复 {created_replies} 条，跳过已迁移 {skipped} 条")
        if skipped_non_approved:
            print(f"⏭️ 未上架 demo 的评论：{skipped_non_approved} 条，未生成公开主题")
        if orphan_total:
            print(f"⚠️ 孤儿评论（demo 不存在）：{orphan_total} 条，未迁移")
        else:
            print("✅ 无孤儿评论")
    finally:
        db.close()


if __name__ == "__main__":
    main()
