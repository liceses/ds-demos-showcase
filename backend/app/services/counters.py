"""浏览/下载/主题浏览计数：内存批次 + 定时落库（30s）。

背景（2026-09-03 事故）：
- 旧实现是每次浏览都 `obj.count += 1; db.commit()` —— 读路径上的一次写事务。
  SQLite 单写者，写队列一长就 `database is locked`，把 `GET /demos/{slug}` 打成 500；
- 且 ORM 写会触发 `Demo.updated_at` 的 `onupdate`，每次浏览都刷新它，
  而版本化预览 URL 的版本 key 曾取自 `updated_at` → 每次浏览换新 URL → CDN 缓存命中率归零。

本模块把计数改成「内存累加 + 每 30s 一批原子 UPDATE」：
- 读路径零写事务（详情页/下载不再碰写锁）；
- 计数是统计语义，允许 30s 级最终一致；
- 落库失败并回内存等下一轮重试 + 打 warning 日志（可观测，绝不影响业务请求）。

2026-09-04 第二次事故（9f3f6ed 当天引入，直到 09-1x 才被发现）：
- `_flush()` 写了 `buf, _BUF = _BUF, {}`——元组赋值目标里的 `_BUF` 使它成为函数
  局部变量，右侧读取当即 `UnboundLocalError`，被 `_loop` 的裸 except 静默吞掉；
- 结果：落库线程每 30s 空转一次，**任何计数自该日起从未持久化过**——
  新 demo 恒 0（老 demo 只是停更在历史值上），生产用户报告「计数全 0」；
- 教训：静默 except 必须配合可观测性（failure 要打日志），且核心落库路径要有回归测试。
"""

import logging
import threading

from sqlalchemy import text

from ..database import SessionLocal

_log = logging.getLogger(__name__)

_LOCK = threading.Lock()
# (表动作, 行 id) -> 增量
_BUF: dict[tuple[str, int], int] = {}
_FLUSH_INTERVAL = 30

# 动作 → 落库 SQL（原子自增，不读-改-写，不触发任何 ORM onupdate）
_SQL = {
    "demo_view": "UPDATE demos SET view_count = view_count + :n WHERE id = :id",
    "demo_download": "UPDATE demos SET download_count = download_count + :n WHERE id = :id",
    "topic_view": "UPDATE forum_topics SET view_count = view_count + :n WHERE id = :id",
}


def bump(action: str, row_id: int) -> None:
    """内存里 +1；调用方如需本次响应数字新鲜，可自行对 ORM 对象 +1（不 commit 即可）。"""
    with _LOCK:
        _BUF[(action, row_id)] = _BUF.get((action, row_id), 0) + 1


def _flush() -> None:
    """把内存批次落库。失败时批次并回内存等下一轮重试：
    commit 未成功 ⇒ 批内 UPDATE 均未生效（SQLite 事务原子性）⇒ 并回不会重复计数。"""
    # 注意：不能写 `buf, _BUF = _BUF, {}` —— 赋值目标里的 _BUF 会变成局部变量，
    # 右侧读取直接 UnboundLocalError（2026-09-04 事故）。clear() 是方法调用（变异），
    # 不会让名字变局部，这里才安全。
    with _LOCK:
        buf = dict(_BUF)
        _BUF.clear()
    if not buf:
        return
    try:
        db = SessionLocal()
        try:
            for (action, row_id), n in buf.items():
                sql = _SQL.get(action)
                if sql is None:
                    continue
                db.execute(text(sql), {"n": n, "id": row_id})
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 —— 统计失败不影响业务，但必须可观测、可重试
        with _LOCK:
            for key, n in buf.items():
                _BUF[key] = _BUF.get(key, 0) + n
        _log.warning(
            "counters flush failed, %s batch(es) merged back for retry: %s", len(buf), exc
        )


def _loop() -> None:
    while True:
        threading.Event().wait(_FLUSH_INTERVAL)
        try:
            _flush()
        except Exception:  # noqa: BLE001
            pass


_thread = threading.Thread(target=_loop, daemon=True)
_thread.start()
