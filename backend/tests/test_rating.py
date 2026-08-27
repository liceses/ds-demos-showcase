"""评分核心路径：登录用户评分 → 聚合/分布 → 撤分。"""

import os

from app.database import SessionLocal
from app.models import Demo


def _seed_demo(slug: str) -> Demo:
    db = SessionLocal()
    try:
        demo = Demo(
            slug=slug,
            title="评分测试",
            description="",
            cover_url="",
            status="approved",
        )
        db.add(demo)
        db.commit()
        db.refresh(demo)
        return demo
    finally:
        db.close()


def test_rate_update_and_unrate(client, auth_headers):
    slug = f"rating-{os.urandom(4).hex()}"
    demo = _seed_demo(slug)
    assert demo.id > 0

    h, _ = auth_headers()

    # 评分 5
    r = client.post(f"/api/v1/demos/{slug}/rating", json={"score": 5, "device_id": ""}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_score"] == 5
    assert body["count"] == 1
    assert body["avg"] == 5.0
    assert body["god"] == 1

    # 改分为 3
    r = client.post(f"/api/v1/demos/{slug}/rating", json={"score": 3, "device_id": ""}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["my_score"] == 3
    assert body["count"] == 1
    assert body["avg"] == 3.0

    # 撤分
    r = client.delete(f"/api/v1/demos/{slug}/rating", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["my_score"] is None
    assert body["count"] == 0

    # 排行榜应不含 0 评（avg 榜）
    r = client.get("/api/v1/leaderboard?sort=avg")
    assert r.status_code == 200
    slugs = [d["slug"] for d in r.json()["items"]]
    assert slug not in slugs
