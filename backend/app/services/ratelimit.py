"""全站限流单一实现（KB-21）：滑动窗口 + 有界键空间。

背景：原先 8 处各写一份 `dict[str, list[float]]`，且只在**同一个键再次被访问时**才裁剪
自己的窗口 —— 每个新 IP/用户访问一次就留下一个永不回收的键（内存单调增长），
多 worker 之间也不共享。

设计（进程内，单 worker uvicorn 足够；将来换 Redis 只换本模块实现，调用方签名不变）：
- 滑动窗口：只保留窗口内的命中时间戳；
- 有界键空间：超过 MAX_KEYS 时先清过期键，仍超限则按 LRU 淘汰最久未用的键；
- 清理摊销：每 `_PRUNE_EVERY` 次调用做一次过期扫描，不在每次请求里全量扫；
- 429 语义与 Retry-After 头保持不变。
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict

from fastapi import HTTPException

MAX_KEYS = 50_000
_PRUNE_EVERY = 512
# 过期清理用的保守窗口：取全站最长窗口（1 小时）的安全上界，
# 用「本次调用的窗口」去清会把别的长窗口桶误删（等于给攻击者重置配额）。
_MAX_WINDOW = 24 * 3600

_lock = threading.Lock()
_buckets: OrderedDict[str, list[float]] = OrderedDict()
_calls = 0


def hit(key: str, limit: int, window: float, *, now: float | None = None) -> None:
    """记一次命中；超限抛 429（带 Retry-After）。key 由调用方拼（含维度前缀）。"""
    global _calls
    now = time.time() if now is None else now
    with _lock:
        _calls += 1
        bucket = _buckets.get(key)
        if bucket is None:
            bucket = _buckets[key] = []
        else:
            cutoff = now - window
            while bucket and bucket[0] <= cutoff:
                bucket.pop(0)
        _buckets.move_to_end(key)
        if len(bucket) >= limit:
            oldest = bucket[0]
            retry = max(1, int(window - (now - oldest)) + 1)
            raise HTTPException(
                status_code=429,
                detail="操作过于频繁，请稍后再试",
                headers={"Retry-After": str(retry)},
            )
        bucket.append(now)

        if _calls % _PRUNE_EVERY == 0 or len(_buckets) > MAX_KEYS:
            _prune(now)
        while len(_buckets) > MAX_KEYS:
            _buckets.popitem(last=False)


def _prune(now: float) -> None:
    """清掉「最后一次命中已超出全站最长窗口」的键（调用方须持有 _lock）。"""
    stale = [k for k, v in _buckets.items() if not v or v[-1] <= now - _MAX_WINDOW]
    for k in stale:
        _buckets.pop(k, None)


def reset() -> None:
    """清空全部桶（测试夹具 / 进程内自愈用）。"""
    global _calls
    with _lock:
        _buckets.clear()
        _calls = 0


def size() -> int:
    """当前桶数量（诊断/测试断言键空间有界）。"""
    with _lock:
        return len(_buckets)
