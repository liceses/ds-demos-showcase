"""计数数据链回归：内存批次必须真实落库（2026-09-04 UnboundLocalError 事故回归位）。

事故回顾：9f3f6ed 引入的 _flush() 里 `buf, _BUF = _BUF, {}` 把 _BUF 变成了函数局部
变量，右侧读取触发 UnboundLocalError，被 _loop 的裸 except 静默吞掉——
落库线程每 30s 空转，自该日起任何环境的计数都从未持久化过。
"""

import pytest
import sqlalchemy as sa

from app.database import Base, SessionLocal, engine
from app.models import Demo
from app.services import counters


@pytest.fixture(scope="module", autouse=True)
def _tables():
    """不经过 TestClient 的纯服务层测试：自己把表建出来（幂等）。"""
    Base.metadata.create_all(bind=engine)


@pytest.fixture()
def demo_row():
    """直接 ORM 建一行已上线的 demo（绕开上传流程，测试只关心计数列）。"""
    import os

    db = SessionLocal()
    try:
        demo = Demo(
            slug=f"counter-fix-{os.urandom(4).hex()}", title="counter fix test", status="approved"
        )
        db.add(demo)
        db.commit()
        return demo.id
    finally:
        db.close()


def _db_count(demo_id: int, col: str) -> int:
    db = SessionLocal()
    try:
        return db.execute(
            sa.text(f"SELECT {col} FROM demos WHERE id = :id"), {"id": demo_id}
        ).scalar_one()
    finally:
        db.close()


def test_flush_persists_bumped_counts(demo_row):
    """bump 后手动 _flush()：view/download 增量必须真实写进 DB（修复前恒 0）。"""
    counters.bump("demo_view", demo_row)
    counters.bump("demo_view", demo_row)
    counters.bump("demo_view", demo_row)
    counters.bump("demo_download", demo_row)
    counters.bump("demo_download", demo_row)

    counters._flush()

    assert _db_count(demo_row, "view_count") == 3
    assert _db_count(demo_row, "download_count") == 2


def test_flush_drains_buffer_so_reincrement_starts_fresh(demo_row):
    """flush 后内存批次清空：同键再 bump 再 flush 只落新增量（不重复、不丢失）。"""
    counters.bump("demo_view", demo_row)
    counters._flush()
    first = _db_count(demo_row, "view_count")

    counters.bump("demo_view", demo_row)
    counters._flush()
    second = _db_count(demo_row, "view_count")

    assert second - first == 1


def test_flush_failed_batch_merged_back_and_retried(demo_row, monkeypatch):
    """落库失败：批次并回内存等下一轮重试（commit 未成功 ⇒ 行未更新 ⇒ 并回不重复计数）。"""

    class BoomOnce:
        """第一次 execute 抛错，之后把调用转发给真会话。"""

        def __init__(self) -> None:
            self._real = None

        def execute(self, *args, **kwargs):
            if self._real is None:
                raise RuntimeError("simulated database is locked")
            return self._real.execute(*args, **kwargs)

        def commit(self):
            if self._real is not None:
                self._real.commit()

        def rollback(self):
            if self._real is not None:
                self._real.rollback()

        def close(self):
            if self._real is not None:
                self._real.close()

    class BoomFactory:
        def __init__(self) -> None:
            self.failed = False

        def __call__(self):
            session = BoomOnce()
            if not self.failed:
                self.failed = True
                return session
            from app.database import SessionLocal as Real

            session._real = Real()
            return session

    factory = BoomFactory()
    monkeypatch.setattr(counters, "SessionLocal", factory)

    counters.bump("demo_view", demo_row)
    counters._flush()  # 失败 → 并回内存
    assert _db_count(demo_row, "view_count") == 0  # 未落库但没丢

    monkeypatch.setattr(counters, "SessionLocal", SessionLocal)  # 恢复真会话
    counters._flush()  # 重试成功
    assert _db_count(demo_row, "view_count") == 1  # 并回的增量没有丢，也没有翻倍


def test_flush_is_safe_on_empty_buffer(demo_row):
    """空批次 flush 不炸也不写库（守护线程常态）。"""
    before = _db_count(demo_row, "view_count")
    counters._flush()
    assert _db_count(demo_row, "view_count") == before