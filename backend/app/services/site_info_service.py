"""站点公开信息聚合：一次请求返回内容 / 社区 / 流量概况。

- 只聚合公开安全数字（不含待审队列、存储路径等管理面信息，后者见 /admin/stats）
- 60s 内存缓存；响应带 Cache-Control: public, max-age=60，Cloudflare 可直接挡流量
- admin ?refresh=1 可强制刷新（发布新内容后立即生效）
"""

import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from ..database import SessionLocal
from ..models import Demo, DemoTag, ForumReply, ForumTopic, Tag, TagKey, User
from ..services import visits
from .settings_service import get_fun_mode

_TTL = 60  # 秒
_lock = threading.Lock()
_cache: dict = {"ts": 0.0, "data": None}


def _utc_iso(dt: datetime) -> str:
    """naive UTC 补 Z，与 main._json_dt 口径一致。"""
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _top_tag_values(db, key: str, limit: int = 5) -> list[dict]:
    """某键下按已上架 demo 数排序的热门值。"""
    rows = (
        db.query(Tag.value, func.count(DemoTag.demo_id))
        .join(DemoTag, DemoTag.tag_id == Tag.id)
        .join(Demo, Demo.id == DemoTag.demo_id)
        .filter(Tag.key == key, Demo.status == "approved")
        .group_by(Tag.value)
        .order_by(func.count(DemoTag.demo_id).desc())
        .limit(limit)
        .all()
    )
    return [{"value": value, "demos": count} for value, count in rows]


def _build() -> dict:
    db = SessionLocal()
    try:
        week_ago = datetime.utcnow() - timedelta(days=7)

        demos_total = db.query(func.count(Demo.id)).filter(Demo.status == "approved").scalar() or 0
        demos_by_type = {
            t: c
            for t, c in db.query(Demo.demo_type, func.count(Demo.id))
            .filter(Demo.status == "approved")
            .group_by(Demo.demo_type)
            .all()
        }
        uploads_7d = (
            db.query(func.count(Demo.id))
            .filter(Demo.status == "approved", Demo.created_at >= week_ago)
            .scalar()
            or 0
        )
        # 创作者 = 有已上架作品的注册用户数；匿名（public）算 1 个
        registered_authors = (
            db.query(func.count(func.distinct(Demo.author_id)))
            .filter(Demo.status == "approved", Demo.author_id.isnot(None))
            .scalar()
            or 0
        )
        has_anon = (
            db.query(Demo.id)
            .filter(Demo.status == "approved", Demo.author_id.is_(None))
            .first()
            is not None
        )

        # tags 只统计键定义内的（排除 author:/version-of 等内部保留标签）
        tag_keys_total = db.query(func.count(TagKey.key)).scalar() or 0
        tag_values_total = db.query(func.count(Tag.id)).join(TagKey, Tag.key == TagKey.key).scalar() or 0

        forum_topics = (
            db.query(func.count(ForumTopic.id)).filter(ForumTopic.status == "normal").scalar() or 0
        )
        users_total = db.query(func.count(User.id)).filter(User.status != "deleted").scalar() or 0

        # 周活：7 天内发过 demo / 发过主题 / 回复过的去重用户
        active: set[int] = set()
        active.update(
            a
            for (a,) in db.query(Demo.author_id)
            .filter(Demo.author_id.isnot(None), Demo.created_at >= week_ago)
            .all()
        )
        active.update(
            a
            for (a,) in db.query(ForumTopic.author_id)
            .filter(ForumTopic.author_id.isnot(None), ForumTopic.created_at >= week_ago)
            .all()
        )
        active.update(
            a
            for (a,) in db.query(ForumReply.author_id)
            .filter(ForumReply.author_id.isnot(None), ForumReply.created_at >= week_ago)
            .all()
        )

        latest = (
            db.query(Demo)
            .filter(Demo.status == "approved")
            .order_by(Demo.created_at.desc(), Demo.id.desc())
            .first()
        )
        latest_demo = (
            {"slug": latest.slug, "title": latest.title, "created_at": _utc_iso(latest.created_at)}
            if latest
            else None
        )

        top_models = _top_tag_values(db, "model")
        top_games = _top_tag_values(db, "game")

        fun_mode = get_fun_mode(db)

        pv = visits.get_stats()
        online_now = visits.get_live_stats()["online"]
    finally:
        db.close()

    return {
        "site": {
            "name": "AI 全民制作人",
            "description": "AI 网页 Demo 作品集",
            "info_version": 1,
        },
        # 显示层开关（整活模式等）；只影响前端展示文案，不改任何数据
        "display": {"fun_mode": fun_mode},
        "content": {
            "demos_total": demos_total,
            "demos_by_type": demos_by_type,
            "authors_total": registered_authors + (1 if has_anon else 0),
            "uploads_last_7d": uploads_7d,
            "tags": {"keys": tag_keys_total, "values": tag_values_total},
            "forum_topics": forum_topics,
        },
        "community": {"users_total": users_total, "users_active_week": len(active)},
        "traffic": {
            "pv_today": pv["today"],
            "pv_yesterday": pv["yesterday"],
            "pv_total": pv["total"],
            "online_now": online_now,
        },
        "hot": {
            "top_models": top_models,
            "top_games": top_games,
            "latest_demo": latest_demo,
        },
        "capabilities": {
            "upload": {
                "anonymous": True,
                "guide": "/api/v1/meta/agent-guide",
                "tag_keys": "/api/v1/tags/tag-keys",
                "idempotency": True,
            },
            "features": {
                "forum": True,
                "ratings": True,
                "session_logs": True,
                "preview": "versioned-url",
            },
        },
        "generated_at": _utc_iso(datetime.utcnow()),
    }


def get_site_info(force: bool = False) -> dict:
    """带 60s TTL 的站点概况（force=True 跳过缓存重建，仅 admin）。"""
    now = time.monotonic()
    with _lock:
        if not force and _cache["data"] is not None and now - _cache["ts"] < _TTL:
            return _cache["data"]
    data = _build()
    with _lock:
        _cache["ts"] = time.monotonic()
        _cache["data"] = data
    return data
