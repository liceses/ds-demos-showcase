"""站点访问统计：按「天 + IP 去重」，跨天滚动，只保留近 90 天。"""

import json
import threading
from datetime import date, datetime, timedelta

from ..database import SessionLocal
from ..models import VisitDaily

KEEP_DAYS = 90

# 进程内当日去重缓存：避免同一天同一 IP 反复打 DB
_lock = threading.Lock()
_cache_date: str | None = None
_cache_ips: set[str] = set()


def _today_str() -> str:
    return date.today().isoformat()


def _load_cache() -> None:
    global _cache_date, _cache_ips
    with _lock:
        if _cache_date == _today_str():
            return
        db = SessionLocal()
        try:
            row = db.get(VisitDaily, _today_str())
            _cache_ips = set(json.loads(row.ips)) if row and row.ips else set()
        finally:
            db.close()
        _cache_date = _today_str()


def record_visit(ip: str) -> None:
    """记录一次整站访问：当天该 IP 已计过则忽略（去重）。"""
    if not ip:
        return
    _load_cache()
    with _lock:
        if ip in _cache_ips:
            return
        _cache_ips.add(ip)

    day = _today_str()
    db = SessionLocal()
    try:
        row = db.get(VisitDaily, day)
        if row is None:
            row = VisitDaily(date=day, count=0, ips="[]")
            db.add(row)
        ips = set(json.loads(row.ips)) if row.ips else set()
        if ip not in ips:
            ips.add(ip)
            row.count = len(ips)
            row.ips = json.dumps(list(ips), ensure_ascii=False)
            db.commit()
        _prune(db)
    finally:
        db.close()


def _prune(db) -> None:
    cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
    from ..models import VisitDaily as VD

    db.query(VD).filter(VD.date < cutoff).delete()


def get_stats() -> dict:
    """返回 today/yesterday/total/last7（升序，当天在最后）。"""
    db = SessionLocal()
    try:
        today = _today_str()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        rows = {r.date: r.count for r in db.query(VisitDaily).all()}
    finally:
        db.close()

    today_count = rows.get(today, 0)
    yesterday_count = rows.get(yesterday, 0)
    total = sum(rows.values())

    last7: list[dict] = []
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        last7.append({"date": d, "count": rows.get(d, 0)})

    return {
        "today": today_count,
        "yesterday": yesterday_count,
        "total": total,
        "last7": last7,
    }
