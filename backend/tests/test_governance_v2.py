"""v2 B1.5 治理地基测试。

覆盖《评审与重排.md》§七点名的必测项：
- 匹配不重复建（同一 model 字符串重复上传必须复用实体）
- 别名归一 / 改名后旧名仍可匹配
- canonical 关系不成环 + 合并防指向已退役实体
- 候选不外泄（列表层）+ deprecated 不进公开序列化
- 写操作全走 service（admin 入口 + 审计可回溯）
- 收件箱 approve 才真正执行
- astra 视区：v2 新路由默认不可见（白名单制）
"""

from fastapi.testclient import TestClient

from app.main import app


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, model_tag=None, prompt=""):
    """上传一个 demo。文件内容必须每次不同：否则会撞上既有的「同作者内容去重 409」。"""
    import os

    data = {"title": title, "description": "治理测试", "demo_type": "web", "prompt": prompt}
    # Q2 起 model 必填：未指定时给一个种子固定值，让本文件聚焦治理语义
    data["tags"] = f'["model:{model_tag or "dsv4-flash"}"]'
    body = f"<!doctype html><html><body>{os.urandom(8).hex()}</body></html>".encode()
    files = {"file": ("index.html", body, "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _model_count(db):
    from app.models import Model

    return db.query(Model).count()


# ---------------- 匹配不重复建 ----------------


def test_repeated_upload_reuses_model_entity(client):
    """同一 model 名重复上传必须复用同一实体，绝不重复建（B1 最该压测的一条）。"""
    _upload(client, "预热", model_tag="dsv4-flash")  # 首传合法建实体，先建立基线

    db = _db()
    before = _model_count(db)
    db.close()
    slug_b = _upload(client, "复用B", model_tag="dsv4-flash")
    slug_c = _upload(client, "复用C", model_tag="dsv4-flash")

    db = _db()
    after = _model_count(db)
    db.close()
    assert after == before, f"重复上传新建了实体：{before} → {after}"

    ids = set()
    for slug in (slug_b, slug_c):
        body = client.get(f"/api/v1/demos/{slug}").json()
        matched = [m for m in body["models"] if m["name"] == "dsv4-flash"]
        assert matched, f"{slug} 未挂上模型实体，models={body['models']}"
        ids.add(matched[0]["id"])
    assert len(ids) == 1, "两次上传挂到了不同实体"


def test_rename_model_keeps_old_name_matchable(client, admin_headers):
    """改名后旧名自动转为别名：历史标签值仍能匹配到同一实体。"""
    db = _db()
    from app.models import Model

    m = Model(slug="rename-me", name="RenameMe", status="candidate")
    db.add(m)
    db.commit()
    mid = m.id
    db.close()

    r = client.put(f"/api/v1/admin/models/{mid}", json={"name": "RenameMeV2"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    # 改名后：旧名转别名保留（历史标签值仍能匹配），新名作为规范名不重复入别名表
    aliases = set(r.json()["aliases"])
    assert "RenameMe" in aliases
    assert "RenameMeV2" not in aliases

    # 旧名仍能解析到改名后的实体（大小写/分隔符差异也吃掉：走同一规范化）
    from app.services import matching_service, model_service

    db2 = _db()
    for probe in ("RenameMe", "renameme", "rename-me"):
        hit = matching_service.match_model(db2, probe)
        assert hit is not None and hit.id == mid, f"旧名 {probe} 未归一到改名后的实体"
    # 用旧名再取实体：必须复用，不得新建（「匹配不重复建」的改名分支）
    before = _model_count(db2)
    reused, created = model_service.get_or_create_model(db2, "RenameMe")
    assert created is False and reused.id == mid
    assert _model_count(db2) == before
    db2.close()


# ---------------- 合并防呆 + 审计 ----------------


def test_merge_rejects_self_and_deprecated_target(client, admin_headers):
    db = _db()
    from app.models import Model

    a = Model(slug="mrg-a", name="MrgA", status="candidate")
    b = Model(slug="mrg-b", name="MrgB", status="active")
    dep = Model(slug="mrg-dep", name="MrgDep", status="deprecated")
    db.add_all([a, b, dep])
    db.commit()
    ids = (a.id, b.id, dep.id)
    db.close()
    aid, bid, depid = ids

    # 合并到自身
    r = client.post(f"/api/v1/admin/models/{aid}/merge", json={"target_id": aid}, headers=admin_headers)
    assert r.status_code == 422, r.text
    # 目标已退役
    r = client.post(f"/api/v1/admin/models/{aid}/merge", json={"target_id": depid}, headers=admin_headers)
    assert r.status_code == 422, r.text
    # dry_run 不改变状态
    r = client.post(f"/api/v1/admin/models/{aid}/merge", json={"target_id": bid, "dry_run": True}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["dry_run"] is True
    assert client.put(f"/api/v1/admin/models/{aid}", json={"description": "仍活跃"}, headers=admin_headers).status_code == 200


def test_merge_writes_audit_and_rejects_double_merge(client, admin_headers):
    """合并成功后必须有审计行；已合并过的源不得再当源（防成环的入口）。"""
    db = _db()
    from app.models import Model

    s = Model(slug="aud-s", name="AudS", status="candidate")
    t = Model(slug="aud-t", name="AudT", status="active")
    db.add_all([s, t])
    db.commit()
    sid, tid = s.id, t.id
    db.close()

    r = client.post(f"/api/v1/admin/models/{sid}/merge", json={"target_id": tid, "reason": "别名归一"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["merged"] is True

    # 源再次当源 → 拒绝
    r2 = client.post(f"/api/v1/admin/models/{sid}/merge", json={"target_id": tid}, headers=admin_headers)
    assert r2.status_code == 422, r2.text

    # 审计可回溯，且带 before/after 快照
    audit = client.get("/api/v1/admin/audit?entity_type=model&action=merge", headers=admin_headers).json()["items"]
    row = next((x for x in audit if x["entity_id"] == sid), None)
    assert row is not None, "合并未落审计（违反治理铁律第 6 条）"
    assert row["before"]["status"] == "candidate"
    assert row["after"]["status"] == "deprecated"
    assert row["reason"] == "别名归一"


# ---------------- 候选不外泄 / deprecated 不进公开序列化 ----------------


def test_deprecated_model_absent_from_public_serialization(client, admin_headers):
    """已合并退役的实体不该出现在作品详情里（它是空壳）。"""
    db = _db()
    from app.models import Demo, DemoModel, Model

    keep = Model(slug="dep-keep", name="DepKeep", status="active")
    gone = Model(slug="dep-gone", name="DepGone", status="active")
    db.add_all([keep, gone])
    db.flush()
    d = Demo(slug="dep-demo", title="退役可见性", status="approved")
    db.add(d)
    db.flush()
    db.add_all([
        DemoModel(demo_id=d.id, model_id=keep.id),
        DemoModel(demo_id=d.id, model_id=gone.id),
    ])
    db.commit()
    gone_id = gone.id
    db.close()

    body = client.get("/api/v1/demos/dep-demo").json()
    assert {m["slug"] for m in body["models"]} == {"dep-keep", "dep-gone"}

    r = client.post(
        f"/api/v1/admin/models/{gone_id}/merge",
        json={"target_id": _id_of(admin_headers, "dep-keep"), "reason": "退役测试"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text

    after = client.get("/api/v1/demos/dep-demo").json()
    assert {m["slug"] for m in after["models"]} == {"dep-keep"}
    # 模型列表也不该出现已退役实体（缺省 active+unverified）
    assert "dep-gone" not in {m["slug"] for m in client.get("/api/v1/models").json()["items"]}


def _id_of(admin_headers, slug):
    db = _db()
    from app.models import Model

    mid = db.query(Model.id).filter(Model.slug == slug).first()[0]
    db.close()
    return mid


# ---------------- 收件箱：approve 才执行 ----------------


def test_suggestion_approve_executes_and_rejects_double_review(client, admin_headers):
    from app.services import suggestion_service

    db = _db()
    s = suggestion_service.create(
        db,
        kind="new_model",
        payload={"name": "InboxModel", "vendor": "TestVendor"},
        confidence=0.87,  # 中置信度 → 必须人工
        source="inferred",
    )
    assert s is not None
    sid = s.id
    db.close()

    # 待审阶段：实体尚未存在
    db = _db()
    from app.models import Model

    assert db.query(Model).filter(Model.name == "InboxModel").first() is None
    db.close()

    r = client.post(f"/api/v1/admin/suggestions/{sid}/review", json={"action": "approve"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    db = _db()
    created = db.query(Model).filter(Model.name == "InboxModel").first()
    db.close()
    assert created is not None and created.status == "active"

    # 重复审核拒绝
    assert client.post(f"/api/v1/admin/suggestions/{sid}/review", json={"action": "approve"}, headers=admin_headers).status_code == 409

    # 低置信度建议不进默认收件箱（只记录不骚扰）
    db = _db()
    low = suggestion_service.create(db, kind="new_model", payload={"name": "LowConf"}, confidence=0.51, source="inferred")
    assert low is not None
    low_id = low.id
    db.close()
    items = client.get("/api/v1/admin/suggestions", headers=admin_headers).json()["items"]
    assert low_id not in {x["id"] for x in items}
    shown = client.get("/api/v1/admin/suggestions?min_confidence=0.1", headers=admin_headers).json()["items"]
    assert low_id in {x["id"] for x in shown}


def test_suggestion_create_is_deduped(client):
    """同类同目标 pending 只有一条（收件箱不堆重复行）。"""
    from app.services import suggestion_service

    db = _db()
    first = suggestion_service.create(db, kind="new_task", payload={"title": "同一建议"}, confidence=0.9, source="inferred")
    assert first is not None
    second = suggestion_service.create(db, kind="new_task", payload={"title": "同一建议"}, confidence=0.7, source="inferred")
    assert second is None  # 去重丢弃
    third = suggestion_service.create(db, kind="new_task", payload={"title": "同一建议"}, confidence=0.95, source="inferred")
    assert third is None  # 更高置信度只刷新证据，不新建
    db.close()


# ---------------- Task 挂题 / 体检 ----------------


def test_task_create_with_demos_and_detach(client, admin_headers):
    slug = _upload(client, "挂题作品")
    db = _db()
    from app.models import Demo

    did = db.query(Demo.id).filter(Demo.slug == slug).first().id
    db.close()

    r = client.post("/api/v1/admin/tasks", json={"title": "治理测试题", "demo_ids": [did]}, headers=admin_headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["attached"] == 1

    detail = client.get(f"/api/v1/tasks/{body['slug']}").json()
    assert detail["demos_total"] == 1

    assert client.delete(f"/api/v1/admin/tasks/{body['id']}/demos/{did}", headers=admin_headers).status_code == 204
    assert client.delete(f"/api/v1/admin/tasks/{body['id']}/demos/{did}", headers=admin_headers).status_code == 404

    # 零挂载可删；有挂载必须走合并
    assert client.delete(f"/api/v1/admin/tasks/{body['id']}", headers=admin_headers).status_code == 204


def test_knowledge_stats_shape(client, admin_headers):
    r = client.get("/api/v1/admin/knowledge/stats", headers=admin_headers)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["demos_approved"] >= 0
    assert "model" in s["coverage"] and "rate" in s["coverage"]["model"]
    assert set(["total_models", "candidate", "unverified", "deprecated"]) <= set(s["model_entity"])
    assert "pending" in s["inbox"]
    assert isinstance(s["duplicate_slugs"], int)


# ---------------- 权限与视区 ----------------


def test_admin_entity_routes_require_auth(client):
    """治理写接口一律 admin：匿名 401、登录普通用户 403。

    注意 conftest 的 client 是 session 级夹具，前序用例登录会留下 Cookie，
    这里必须显式清空才能真正测「未认证」口径。
    """
    client.cookies.clear()
    assert client.get("/api/v1/admin/models").status_code == 401
    assert client.post("/api/v1/admin/tasks", json={"title": "x"}).status_code == 401
    assert client.get("/api/v1/admin/audit").status_code == 401

    h, _ = _plain_user(client)
    assert client.get("/api/v1/admin/models", headers=h).status_code == 403
    client.cookies.clear()


def _plain_user(client):
    import os

    name = f"g{os.urandom(4).hex()}"
    client.post("/api/v1/auth/register", json={"username": name, "password": "password123"})
    r = client.post("/api/v1/auth/login", json={"username": name, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, name


def test_astra_scope_denies_v2_routes(client):
    """astra 橱窗白名单制：v2 新增路由默认不可见（防漏堵）。"""
    with TestClient(app, base_url="http://astrademos.top") as astra:
        assert astra.get("/api/v1/models").status_code == 404
        assert astra.get("/api/v1/models/whatever").status_code == 404
        assert astra.get("/api/v1/tasks").status_code == 404
        assert astra.get("/api/v1/explore").status_code == 404
        assert astra.get("/api/v1/admin/models").status_code == 404
        # 主站不受影响
        assert client.get("/api/v1/models").status_code == 200
        assert client.get("/api/v1/explore").status_code == 200
