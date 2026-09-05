"""首页策展（07 §2.2 / T5·M5-F1）：demos.featured + featured_order 后端面。

覆盖：GET /demos?featured=1（按 order，approved）、/admin/featured 列表/添加/移除/
order 上下移/hero 置顶，写操作全部 require_admin + 落审计；非 approved 拒绝入池。
"""

import os

from app.models import Demo


def _upload(client, title, tags, headers=None):
    data = {"title": title, "description": "精选测试", "demo_type": "web", "tags": tags}
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files, headers=headers or {})
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _demo_id(slug: str) -> int:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        row = db.query(Demo).filter(Demo.slug == slug).first()
        assert row is not None
        return row.id
    finally:
        db.close()


def _featured_slugs(client, admin_headers):
    r = client.get("/api/v1/admin/featured", headers=admin_headers)
    assert r.status_code == 200, r.text
    return [x["slug"] for x in r.json()["items"]]


def test_featured_add_remove_and_public_list(client, admin_headers):
    # 用 admin 身份上传：匿名上传受 20 次/小时/IP 进程内限流，避免污染共享测试库的其他用例
    s1 = _upload(client, "精选甲", '["model:dsv4-pro", "type:demo"]', headers=admin_headers)
    s2 = _upload(client, "精选乙", '["model:dsv4-pro", "type:demo"]', headers=admin_headers)
    id1, id2 = _demo_id(s1), _demo_id(s2)

    # 空池起步
    assert _featured_slugs(client, admin_headers) == []
    r = client.get("/api/v1/demos", params={"featured": 1})
    assert r.status_code == 200
    assert r.json()["items"] == []

    # 添加（尾部追加 order）
    r = client.post("/api/v1/admin/featured", json={"slug": s1}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["featured_order"] == 1
    r = client.post("/api/v1/admin/featured", json={"demo_id": id2}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["featured_order"] == 2

    # 重复添加 → 409
    r = client.post("/api/v1/admin/featured", json={"slug": s1}, headers=admin_headers)
    assert r.status_code == 409, r.text

    # 公开读口按 order
    r = client.get("/api/v1/demos", params={"featured": 1, "page_size": 20})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert [x["slug"] for x in items] == [s1, s2]

    # hero 置顶：把第二件抬成首页 hero（池首）
    r = client.put(f"/api/v1/admin/featured/{id2}/hero", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert [x["slug"] for x in client.get("/api/v1/admin/featured", headers=admin_headers).json()["items"]] == [s2, s1]

    # 上下移：第二件上移 → 回到 s1 在首
    r = client.put(f"/api/v1/admin/featured/{id1}/order", json={"direction": "up"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert [x["slug"] for x in client.get("/api/v1/admin/featured", headers=admin_headers).json()["items"]] == [s1, s2]
    # 已在首的再上移 → 409
    r = client.put(f"/api/v1/admin/featured/{id1}/order", json={"direction": "up"}, headers=admin_headers)
    assert r.status_code == 409, r.text
    # 非法方向 → 422
    r = client.put(f"/api/v1/admin/featured/{id1}/order", json={"direction": "left"}, headers=admin_headers)
    assert r.status_code == 422, r.text

    # 移除后重排（剩下那件 order 归 1）
    r = client.delete(f"/api/v1/admin/featured/{id2}", headers=admin_headers)
    assert r.status_code == 200, r.text
    r = client.get("/api/v1/admin/featured", headers=admin_headers)
    assert [x["slug"] for x in r.json()["items"]] == [s1]
    assert r.json()["items"][0]["featured_order"] == 1

    # 审计落库（同事务）
    r = client.get("/api/v1/admin/audit", params={"action": "featured_add", "page_size": 50}, headers=admin_headers)
    assert r.status_code == 200, r.text
    actions = [a["action"] for a in r.json()["items"]]
    assert actions.count("featured_add") >= 1
    demo_actions = [a for a in r.json()["items"] if a.get("entity_type") == "demo"]
    assert demo_actions, "featured 审计应带 entity_type=demo"

    # 非 admin 拒绝（清 cookie 去掉测试客户端自动带上的登录态）
    client.cookies.clear()
    r = client.post("/api/v1/admin/featured", json={"slug": s1})
    assert r.status_code in (401, 403)


def test_featured_rejects_non_approved(client, admin_headers):
    """未上架（pending）作品不能进首页策展池——策展=从已上线里精选。"""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        row = Demo(
            slug="featured-pending-demo",
            title="未上架的",
            description="x",
            demo_type="web",
            cover_url="",
            prompt="",
            status="pending",
            external_url=None,
        )
        db.add(row)
        db.commit()
        pid = row.id
    finally:
        db.close()

    r = client.post("/api/v1/admin/featured", json={"demo_id": pid}, headers=admin_headers)
    assert r.status_code == 422, r.text
    assert "已上架" in r.json()["detail"]
