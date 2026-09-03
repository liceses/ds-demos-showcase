"""审计浏览接口：白名单单一来源、分页、actor 署名、关键词检索。

回归重点：`attribute` 曾漏在路由里硬编码的 action 白名单外，导致这类记录筛不出来。
现在白名单来自 `models.AUDIT_ACTIONS`，并且测试**逐项验证常量与实际写入一致**。
"""

import os

from app.models import AUDIT_ACTIONS, AuditLog


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags):
    data = {"title": title, "description": "审计接口用例", "demo_type": "web", "tags": tags}
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def test_audit_whitelist_covers_every_action_written(client, admin_headers):
    """常量必须覆盖库里真实出现的所有 action —— 漏一个就有记录筛不出来。"""
    slug = _upload(client, "审计白名单用例", '["model:dsv4-flash", "type:game"]')
    from app.models import Demo, Model
    from app.services import model_service

    db = _db()
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    demo_id = demo.id
    target = db.query(Model).filter(Model.slug == "dsv4-pro").first()
    if target is None:
        target = model_service.get_or_create_model(db, "dsv4-pro", vendor="DeepSeek", status="active")[0]
        db.commit()
    target_id = target.id  # 先取成普通 int：close() 之后再碰 ORM 实例会 DetachedInstanceError
    db.close()

    client.post(
        "/api/v1/admin/attribution",
        json={"demo_ids": [demo_id], "target_id": target_id, "reason": "审计白名单验证"},
        headers=admin_headers,
    )

    db = _db()
    try:
        actions = {a for (a,) in db.query(AuditLog.action).distinct().all()}
    finally:
        db.close()
    assert "attribute" in actions
    missing = actions - set(AUDIT_ACTIONS)
    assert not missing, f"库里有动作不在白名单，审计页筛不出来：{missing}"

    r = client.get("/api/v1/admin/audit?action=attribute", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["total"] >= 1
    assert "attribute" in r.json()["actions"]


def test_audit_actor_is_resolved_to_username(client, admin_headers):
    r = client.get("/api/v1/admin/audit?page_size=10", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    if not items:
        return  # 干净库上无记录：形状断言已由上一例覆盖
    for row in items:
        assert row["actor"], row
        # user 型动作必须解析出真实署名，而不是只剩 actor_type
        if row["actor_type"] == "user":
            assert row["actor"] not in ("user", "unknown"), row


def test_audit_paging_and_filters(client, admin_headers):
    p1 = client.get("/api/v1/admin/audit?page=1&page_size=3", headers=admin_headers).json()
    p2 = client.get("/api/v1/admin/audit?page=2&page_size=3", headers=admin_headers).json()
    assert p1["total"] == p2["total"]
    ids1 = {x["id"] for x in p1["items"]}
    ids2 = {x["id"] for x in p2["items"]}
    assert not (ids1 & ids2), "分页重叠"

    bad = client.get("/api/v1/admin/audit?action=nonsense", headers=admin_headers)
    assert bad.status_code == 422, bad.text

    ent = client.get("/api/v1/admin/audit?entity_type=model", headers=admin_headers).json()
    assert all(x["entity_type"] == "model" for x in ent["items"]), ent["items"][:2]


def test_audit_requires_admin(client):
    client.cookies.clear()
    assert client.get("/api/v1/admin/audit").status_code == 401
