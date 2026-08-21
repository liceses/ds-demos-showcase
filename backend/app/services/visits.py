"""站点访问统计：按「天 + IP 去重」，跨天滚动，只保留近 90 天。

性能：不每个请求写 DB —— 进程内缓存当日 IP 集合，后台线程定时落库（默认 30s）。
单 worker 下内存安全；历史读统计时合并当日内存值保证实时性。
"""

import json
import threading
from datetime import date, timedelta

from ..database import SessionLocal
from ..models import VisitDaily

KEEP_DAYS = 90
FLUSH_INTERVAL = 30  # 秒

_lock = threading.Lock()
_today: str = date.today().isoformat()
_today_ips: set[str] = {}


def _roll_if_needed() -> None:
    global _today
    now = date.today().isoformat()
    if now != _today:
        # 跨天：先落盘昨天的，再重置缓存
        _flush_locked()
        _today = now
        _today_ips.clear()


def record_visit(ip: str) -> None:
    """记录一次整站访问：同一天该 IP 已计过则忽略。仅内存操作，不落库。"""
    if not ip:
        return
    with _lock:
        _roll_if_needed()
        _today_ips.add(ip)


def _flush_locked() -> None:
    """把今日内存计数写入 DB（线程需已持锁）。"""
    day = _today
    ips = list(_today_ips)
    if not ips:
        return
    db = SessionLocal()
    try:
        row = db.get(VisitDaily, day)
        if row is None:
            row = VisitDaily(date=day, count=0, ips="[]")
            db.add(row)
        row.count = len(ips)
        row.ips = json.dumps(ips, ensure_ascii=False)
        db.commit()
        # 顺手清理过期行
        cutoff = (date.today() - timedelta(days=KEEP_DAYS)).isoformat()
        db.query(VisitDaily).filter(VisitDaily.date < cutoff).delete()
        db.commit()
    finally:
        db.close()


def _flusher_loop() -> None:
    while True:
        threading.Event().wait(FLUSH_INTERVAL)
        try:
            with _lock:
                _roll_if_needed()
                _flush_locked()
        except Exception:  # noqa: BLE001
            pass  # 统计失败不影响业务


_thread = threading.Thread(target=_flusher_loop, daemon=True)
_thread.start()


def get_stats() -> dict:
    """返回 today/yesterday/total/last7（升序，当天在最后）。"""
    with _lock:
        _roll_if_needed()
        live_today = len(_today_ips)

    db = SessionLocal()
    try:
        rows = {r.date: r.count for r in db.query(VisitDaily).all()}
    finally:
        db.close()

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    today_count = max(rows.get(today, 0), live_today)
    yesterday_count = rows.get(yesterday, 0)
    rows[today] = today_count
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
