"""T3·M5-B3：访问打点限流 30→120（07 §3.3-4 用户裁决）。

锚点：
1. _VISIT_RATE == 120（常量锁——快速浏览不该被 429 静默吞 PV）；
2. heartbeat 不同档（10/min；30s 心跳节奏=2/min，5× 余量），同档才调故保持不变；
3. 行为锁：同一 IP 1 分钟内第 121 次 /stats/visit → 429，前 120 次 200。
"""

from app.routers import stats


def test_visit_rate_bumped_to_120():
    assert stats._VISIT_RATE == 120


def test_heartbeat_rate_kept_10():
    # 评估结论（07 §3.3-4「heartbeat 同步评估」）：heartbeat 档 10/min ≠ visit 档 30/min，
    # 且 30s 心跳节奏=2/min、余量 5×——不同档不调
    assert stats._HEARTBEAT_RATE == 10


def test_visit_rate_limit_429_after_120(client):
    for _ in range(120):
        r = client.post("/api/v1/stats/visit")
        assert r.status_code == 200, r.text
    r = client.post("/api/v1/stats/visit")
    assert r.status_code == 429
