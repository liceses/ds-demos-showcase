"""撤销合并 + 改 slug（含别名兜底路由）。

刻意锁两条容易被含糊过去的边界：
- 早期合并没记 moved_demo_ids → 撤销只能恢复实体，**绝不猜哪些作品是它的**；
- 改 slug 后旧值必须仍可解析（外部贴出去的链接不该突然 404）。
"""

import os

from app.models import AuditLog, Demo, DemoModel, Model


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags):
    data = {"title": title, "description": "撤销用例", "demo_type": "web", "tags": tags}
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _mk_models(names):
    from app.services import model_service

    db = _db()
    try:
        ids = {}
        for n in names:
            m, _ = model_service.get_or_create_model(db, n, vendor="DeepSeek", status="active")
            ids[n] = {"id": m.id, "slug": m.slug}
        db.commit()
        return ids
    finally:
        db.close()


def _demo_id(slug):
    db = _db()
    try:
        return db.query(Demo).filter(Demo.slug == slug).first().id
    finally:
        db.close()


def test_merge_then_unmerge_restores_everything(client, admin_headers):
    slug = _upload(client, "撤销合并主用例", '["model:dsv4-flash", "type:game"]')
    demo_id = _demo_id(slug)
    ids = _mk_models(["Undo Src", "Undo Dst"])
    src, dst = ids["Undo Src"]["id"], ids["Undo Dst"]["id"]

    # 先把作品挂到 src（模拟合并前状态）。
    # 注：实体是 get_or_create_model 建的，但 Tag 值不会自动出现 —— 用 ensure_tag_value 补，
    # 与真实上传路径一致（词表值先有，实体后建）。
    db = _db()
    from app.models import DemoTag
    from app.services import model_service

    d = db.query(Demo).filter(Demo.id == demo_id).first()
    tag = model_service.ensure_tag_value(db, "Undo Src")
    db.add(DemoTag(demo_id=d.id, tag_id=tag.id))
    db.commit()
    model_service.sync_demo_models(db, d)
    db.commit()
    assert db.query(DemoModel).filter(DemoModel.demo_id == demo_id, DemoModel.model_id == src).first() is not None
    db.close()

    m = client.post(f"/api/v1/admin/models/{src}/merge", json={"target_id": dst, "dry_run": False, "reason": "验证撤销"}, headers=admin_headers)
    assert m.status_code == 200, m.text
    assert m.json()["affected_demos"] >= 1

    prev = client.post(f"/api/v1/admin/models/{src}/unmerge", json={"dry_run": True}, headers=admin_headers)
    assert prev.status_code == 200, prev.text
    pv = prev.json()
    assert pv["reliable"] is True and pv["will_restore"] == pv["moved_total"], pv

    ex = client.post(f"/api/v1/admin/models/{src}/unmerge", json={"dry_run": False, "reason": "撤错了"}, headers=admin_headers)
    assert ex.status_code == 200, ex.text

    db = _db()
    try:
        s = db.get(Model, src)
        assert s.status == "active" and s.merged_into_id is None, (s.status, s.merged_into_id)
        assert db.query(DemoModel).filter(DemoModel.demo_id == demo_id, DemoModel.model_id == src).first() is not None
        assert db.query(DemoModel).filter(DemoModel.demo_id == demo_id, DemoModel.model_id == dst).first() is None
        row = db.query(AuditLog).filter(AuditLog.action == "unmerge", AuditLog.entity_id == src).order_by(AuditLog.id.desc()).first()
        assert row is not None and "撤错了" in (row.reason or "")
    finally:
        db.close()

    d = client.get(f"/api/v1/demos/{slug}").json()
    assert any(x["slug"] == "undo-src" for x in d["models"]), d["models"]


def test_unmerge_requires_merged_state(client, admin_headers):
    ids = _mk_models(["NotMerged A", "NotMerged B"])
    r = client.post(f"/api/v1/admin/models/{ids['NotMerged A']['id']}/unmerge", json={"dry_run": True}, headers=admin_headers)
    assert r.status_code == 422, r.text
    assert "已被合并" in r.json()["detail"]


def test_unmerge_legacy_without_evidence(client, admin_headers):
    """早期合并（没记 moved_demo_ids）：只能恢复实体，且预览必须明说不可靠。"""
    ids = _mk_models(["Legacy Src", "Legacy Dst"])
    db = _db()
    try:
        s = db.get(Model, ids["Legacy Src"]["id"])
        s.status = "deprecated"
        s.merged_into_id = ids["Legacy Dst"]["id"]  # 直接造状态，绕过审计（模拟老数据）
        db.commit()
    finally:
        db.close()

    pv = client.post(f"/api/v1/admin/models/{ids['Legacy Src']['id']}/unmerge", json={"dry_run": True}, headers=admin_headers).json()
    assert pv["reliable"] is False and pv["will_restore"] == 0, pv

    ex = client.post(f"/api/v1/admin/models/{ids['Legacy Src']['id']}/unmerge", json={"dry_run": False}, headers=admin_headers)
    assert ex.status_code == 200 and ex.json()["will_restore"] == 0
    db = _db()
    try:
        s = db.get(Model, ids["Legacy Src"]["id"])
        assert s.status == "active" and s.merged_into_id is None
    finally:
        db.close()


def test_slug_change_keeps_old_url_resolvable(client, admin_headers):
    ids = _mk_models(["Slug Me"])
    ident = ids["Slug Me"]["id"]

    bad = client.put(f"/api/v1/admin/models/{ident}", json={"slug": "有中文"}, headers=admin_headers)
    assert bad.status_code == 422, bad.text
    messy = client.put(f"/api/v1/admin/models/{ident}", json={"slug": "a b*c"}, headers=admin_headers)
    assert messy.status_code == 422 and "a-b-c" in messy.json()["detail"], messy.text

    ok = client.put(f"/api/v1/admin/models/{ident}", json={"slug": "slug-me-new"}, headers=admin_headers)
    assert ok.status_code == 200, ok.text
    assert ok.json()["slug"] == "slug-me-new"

    assert client.get("/api/v1/models/slug-me-new").status_code == 200
    # 旧 slug 通过别名仍可解析（外部链接不该突然死掉）
    old = client.get("/api/v1/models/slug-me")
    assert old.status_code == 200, old.text
    assert old.json()["slug"] == "slug-me-new"

    db = _db()
    try:
        row = db.query(AuditLog).filter(AuditLog.action == "slug_set", AuditLog.entity_id == ident).order_by(AuditLog.id.desc()).first()
        assert row is not None and "slug-me" in (row.reason or "")
    finally:
        db.close()


def test_slug_collision_rejected(client, admin_headers):
    ids = _mk_models(["Occupy A", "Occupy B"])
    r = client.put(f"/api/v1/admin/models/{ids['Occupy B']['id']}", json={"slug": "occupy-a"}, headers=admin_headers)
    assert r.status_code == 409, r.text
    assert "占用" in r.json()["detail"]
