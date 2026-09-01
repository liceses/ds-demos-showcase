"""站点访问统计：原始 PV（每次访问 +1，累加不覆盖）+ 实时在线/近期访问（内存）。
跨天滚动，只保留近 90 天。
不收集访客 IP：visit_daily.ips 为历史遗留列，已停止写入（无消费方，且有膨胀/隐私成本）。
"""

import threading
import time
from collections import deque
from datetime import date, timedelta

from ..database import SessionLocal
from ..models import VisitDaily

KEEP_DAYS = 90
FLUSH_INTERVAL = 30  # 秒
RECENT_WINDOW = 600  # 实时近期时间戳窗口：10 分钟
ONLINE_WINDOW = 120  # 在线判定：最后 2 分钟心跳

_lock = threading.Lock()
_today: str = date.today().isoformat()
_today_count: int = 0
_recent_hits: deque[float] = deque()   # 实时 PV 时间戳（最近 10 分钟）
_online: dict[str, float] = {}         # ip -> 最后心跳时间


def _roll_if_needed() -> None:
    global _today, _today_count
    now = date.today().isoformat()
    if now != _today:
        _flush_locked()   # 跨天：先落盘昨天的
        _today = now
        _today_count = 0


def record_visit() -> None:
    """记录一次页面访问：原始 PV +1。仅内存，不落库。
    统计失败必须静默，绝不能影响业务请求。"""
    global _today_count
    try:
        with _lock:
            _roll_if_needed()
            _today_count += 1
            _recent_hits.append(time.time())
            # 顺手清理过期时间戳，保持队列只存近 RECENT_WINDOW
            cutoff = time.time() - RECENT_WINDOW
            while _recent_hits and _recent_hits[0] < cutoff:
                _recent_hits.popleft()
    except Exception:  # noqa: BLE001 —— 统计失败不影响业务
        pass


def heartbeat(ip: str | None = None) -> None:
    """实时在线心跳：记录 IP 最后在线时间；超过 ONLINE_WINDOW 视为下线。仅内存。"""
    if not ip:
        return
    try:
        with _lock:
            now = time.time()
            _online[ip] = now
            cutoff = now - ONLINE_WINDOW
            stale = [k for k, v in _online.items() if v < cutoff]
            for k in stale:
                _online.pop(k, None)
    except Exception:  # noqa: BLE001
        pass


def get_live_stats(db=None) -> dict:
    """实时访问：在线人数 + 近1/5分钟 PV + 今日 PV。
    db 传入时复用调用方会话（避免一个请求嵌套 checkout 第二个连接打满池子）。"""
    now = time.time()
    with _lock:
        online = sum(1 for v in _online.values() if v > now - ONLINE_WINDOW)
        recent = [t for t in _recent_hits if t > now - 300]
        last1 = sum(1 for t in recent if t > now - 60)
        last5 = len(recent)
    today = get_stats(db)["today"]
    return {"online": online, "last1min": last1, "last5min": last5, "today": today}


def _flush_locked() -> None:
    """把今日内存计数写入 DB（调用方须已持有 _lock）。累加式，绝不覆盖历史值。
    成功落库后清零内存批次，_today_count 仅代表「距上次 flush 的增量」，避免同一批重复累加。"""
    global _today_count
    day = _today
    if _today_count == 0:
        return
    db = SessionLocal()
    try:
        row = db.get(VisitDaily, day)
        if row is None:
            row = VisitDaily(date=day, count=0)
            db.add(row)
        # 原始 PV：累加本次批次的增量（不覆盖）
        row.count += _today_count
        db.commit()
        # 落库成功后清零，防止下一轮 flush 把同一批数据再算一遍
        _today_count = 0
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


def get_stats(db=None) -> dict:
    """返回 today/yesterday/total/last7（升序，当天在最后）。
    db 传入时复用调用方会话：site-info 等聚合入口已在自己的会话里，
    再开第二个会话会在高并发下把 QueuePool 直接吃满。"""
    with _lock:
        _roll_if_needed()
        live_today = _today_count

    if db is not None:
        rows = {r.date: r.count for r in db.query(VisitDaily).all()}
    else:
        own = SessionLocal()
        try:
            rows = {r.date: r.count for r in own.query(VisitDaily).all()}
        finally:
            own.close()

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
