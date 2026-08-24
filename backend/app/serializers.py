from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .models import Comment, Demo, DemoTimeline, DemoTag, SessionLog, Tag, TagKey, User
from .services import oss


def tag_dict(db: Session, tag: Tag) -> dict:
    demo_count = (
        db.query(func.count(DemoTag.demo_id))
        .filter(DemoTag.tag_id == tag.id)
        .scalar()
        or 0
    )
    child_count = db.query(func.count(Tag.id)).filter(Tag.parent_id == tag.id).scalar() or 0
    key_def = db.get(TagKey, tag.key)
    return {
        "id": tag.id,
        "key": tag.key,
        "value": tag.value,
        "description": tag.description,
        "parent_id": tag.parent_id,
        "demo_count": demo_count,
        "child_count": child_count,
        "mode": key_def.mode if key_def else "open",
    }


def serialize_demo(
    db: Session,
    demo: Demo,
    current_user_id: int | None = None,
    detail: bool = False,
) -> dict:
    author: User | None = demo.author
    tags = [{"key": dt.tag.key, "value": dt.tag.value} for dt in demo.tag_associations]
    comment_count = (
        db.query(func.count(Comment.id)).filter(Comment.demo_id == demo.id).scalar() or 0
    )
    session_log_count = (
        db.query(func.count(SessionLog.id)).filter(SessionLog.demo_id == demo.id).scalar() or 0
    )

    data = {
        "slug": demo.slug,
        "title": demo.title,
        "description": demo.description,
        "cover_url": demo.cover_url,
        "demo_type": demo.demo_type,
        "external_url": demo.external_url,
        "preview_url": (
            ""
            if demo.demo_type != "web"
            else (
                f"{settings.preview_base_url.rstrip('/')}/preview/{demo.slug}/index.{'svg' if demo.single_file == 'svg' else 'html'}"
                if settings.preview_base_url
                else (
                    oss.public_url(f"demos/{demo.slug}/files/index.{'svg' if demo.single_file == 'svg' else 'html'}")
                    if oss.enabled() and not settings.oss_serve_local
                    else f"/preview/{demo.slug}/index.{'svg' if demo.single_file == 'svg' else 'html'}"
                )
            )
        ),
        "author": author.username if author else "public",
        "author_id": demo.author_id,
        "tags": tags,
        "view_count": demo.view_count,
        "download_count": demo.download_count,
        "comment_count": comment_count,
        "created_at": demo.created_at,
        "status": demo.status,
        "rating_avg": round(demo.rating_avg or 0.0, 2),
        "rating_count": demo.rating_count,
        "rating_god": demo.rating_god,
        "rating_ghost": demo.rating_ghost,
        "prompt": demo.prompt,
    }

    if detail:
        from .services.storage import demo_files_dir, demo_storage_size

        timeline = (
            db.query(DemoTimeline)
            .filter(DemoTimeline.demo_id == demo.id)
            .order_by(DemoTimeline.created_at.desc(), DemoTimeline.id.desc())
            .all()
        )
        files_dir = demo_files_dir(demo.slug)
        data.update(
            {
                "session_log_count": session_log_count,
                "is_author": bool(current_user_id is not None and demo.author_id == current_user_id),
                "prompt": demo.prompt,
                "video_url": demo.video_url,
                "file_size": files_dir.stat().st_size if files_dir.exists() else None,
                "storage_size": demo_storage_size(demo.slug),
                "inconsistency": demo.demo_type != "link" and not files_dir.exists(),
                "timeline": [
                    {
                        "id": t.id,
                        "version_label": t.version_label,
                        "message": t.message,
                        "old_slug": t.old_slug,
                        "created_at": t.created_at,
                    }
                    for t in timeline
                ],
            }
        )
    return data
