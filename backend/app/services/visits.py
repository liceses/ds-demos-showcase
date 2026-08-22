"""站点访问统计：原始 PV（每次访问 +1，累加不覆盖），跨天滚动，只保留近 90 天。
同时维护当日 IP 集合（UV 备用）。内存缓冲 + 后台线程定时落库（默认 30s）。
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
_today_ips: set[str] = set()
_today_count: int = 0


def _roll_if_needed() -> None:
    global _today, _today_count
    now = date.today().isoformat()
    if now != _today:
        _flush_locked()   # 跨天：先落盘昨天的
        _today = now
        _today_ips.clear()
        _today_count = 0


def record_visit(ip: str | None = None) -> None:
    """记录一次页面访问：原始 PV +1（ip 可选，仅用于 UV 集合）。仅内存，不落库。"""
    with _lock:
        _roll_if_needed()
        _today_count += 1
        if ip:
            _today_ips.add(ip)


def _flush_locked() -> None:
    """把今日内存计数写入 DB（调用方须已持有 _lock）。累加式，绝不覆盖历史值。"""
    day = _today
    if _today_count == 0:
        return
    ips = list(_today_ips)
    db = SessionLocal()
    try:
        row = db.get(VisitDaily, day)
        if row is None:
            row = VisitDaily(date=day, count=0, ips="[]")
            db.add(row)
        # 原始 PV：累加本次批次的计数量（不覆盖）
        row.count += _today_count
        existing = set(json.loads(row.ips)) if row.ips else set()
        existing.update(ips)
        row.ips = json.dumps(list(existing), ensure_ascii=False)
        db.commit()
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
        except Exception:  # noqa: BLE001 —— 统计失败不影响业务
            pass


_thread = threading.Thread(target=_flusher_loop, daemon=True)
_thread.start()


def get_stats() -> dict:
    """返回 today/yesterday/total/last7（升序，当天在最后）。"""
    with _lock:
        _roll_if_needed()
        live_today = _today_count

    db = SessionLocal()
    try:
        rows = {r.date: r.count for r in db.query(VisitDaily).all()}
    finally:
        db.close()

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    today_count = rows.get(today, 0) + live_today
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
