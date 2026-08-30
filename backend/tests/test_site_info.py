"""站点 site-info / health 接口。"""


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert r.headers["cache-control"] == "no-store"


def test_site_info_shape_and_counts(client):
    from app.database import SessionLocal
    from app.models import Demo

    # 先造数据再首次请求（接口有 60s 缓存，保证看到本测试的数据）
    db = SessionLocal()
    db.add(Demo(slug="site-info-demo", title="站点信息测试", status="approved", demo_type="web"))
    db.commit()
    db.close()

    r = client.get("/api/v1/meta/site-info")
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["site"]["info_version"] == 1
    assert data["content"]["demos_total"] >= 1
    assert data["content"]["demos_by_type"].get("web", 0) >= 1
    assert data["content"]["uploads_last_7d"] >= 1
    # init_db seed 的默认标签键 / 论坛首帖 / admin 用户
    assert data["content"]["tags"]["keys"] >= 8
    assert data["content"]["forum_topics"] >= 1
    assert data["community"]["users_total"] >= 1
    assert {"pv_today", "pv_yesterday", "pv_total", "online_now"} <= set(data["traffic"].keys())
    assert data["capabilities"]["upload"]["guide"] == "/api/v1/meta/agent-guide"
    assert data["generated_at"].endswith("Z")
    assert "max-age=60" in r.headers["cache-control"]


def test_site_info_refresh_needs_admin(client, admin_headers):
    # 匿名带 refresh=1：不报错、不强刷（等价普通请求）
    r = client.get("/api/v1/meta/site-info?refresh=1")
    assert r.status_code == 200
    # admin 强刷成功
    r = client.get("/api/v1/meta/site-info?refresh=1", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["site"]["info_version"] == 1
