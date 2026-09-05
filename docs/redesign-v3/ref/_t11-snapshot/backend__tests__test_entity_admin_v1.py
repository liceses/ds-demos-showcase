"""M3-B1 实体管理端点测试：统一 PATCH（字段白名单）/ Task 挂摘 by slug / 批量审核。

制度红线对账：写操作走 service + 审计（断言 audit 落行）；白名单外 422；
批量审核单条失败不拖垮整批。
测试纪律：实体用 POST /admin/models 直造（**不走上传**——20/h 上传限速会把全量
套件挤爆 429）；建议用 db 直插 pending 行（test_challenge_v2 同款语义）。
"""

import json

from app.main import app
from fastapi.testclient import TestClient


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _mk_model(client: TestClient, admin_headers, name: str) -> dict:
    """直造模型实体（POST /admin/models，不走上传）。返回 brief（id/slug/name）。"""
    r = client.post("/api/v1/admin/models", json={"name": name, "description": "实体管理测试"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _audit_count(client: TestClient, admin_headers, entity_type, entity_id, action=None):
    params = {"entity_type": entity_type, "entity_id": entity_id, "page_size": 50}
    if action:
        params["action"] = action
    r = client.get("/api/v1/admin/audit", params=params, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["total"]


def test_patch_model_description_writes_audit(client: TestClient, admin_headers):
    m = _mk_model(client, admin_headers, "patch-model-a")
    before = _audit_count(client, admin_headers, "model", m["id"], action="update")

    r = client.patch(
        f"/api/v1/admin/entities/model/{m['slug']}",
        json={"description": "直改后的描述", "reason": "补描述"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["type"] == "model"
    assert "description" in r.json()["updated"]
    assert _audit_count(client, admin_headers, "model", m["id"], action="update") == before + 1

    # 直改生效：详情读回新描述
    assert client.get(f"/api/v1/models/{m['slug']}").json()["description"] == "直改后的描述"


def test_patch_rejects_fields_outside_whitelist(client: TestClient, admin_headers):
    m = _mk_model(client, admin_headers, "patch-model-b")
    # Model 白名单外（demo_count 是派生只读；slug 仅合并流程内改）
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"demo_count": 999}, headers=admin_headers)
    assert r.status_code == 422, r.text
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"slug": "hijack"}, headers=admin_headers)
    assert r.status_code == 422, r.text
    # 未知实体类型
    r = client.patch("/api/v1/admin/entities/alien/1", json={"x": 1}, headers=admin_headers)
    assert r.status_code == 404, r.text


def test_patch_tag_value_description_and_group(client: TestClient, admin_headers):
    db = _db()
    from app.models import Tag

    tag = db.query(Tag).filter(Tag.key == "model", Tag.value == "dsv4-pro").first()
    db.close()
    assert tag is not None
    r = client.patch(
        f"/api/v1/admin/entities/tag/{tag.id}",
        json={"description": "V4 Pro——强推理（直改）", "group": "DeepSeek"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"] == "dsv4-pro"
    # 审计落行（tag 变更此前不落审计——本端点起落）
    assert _audit_count(client, admin_headers, "tag", tag.id, action="update") >= 1
    keys = client.get("/api/v1/tags/tag-keys").json()
    dsv4pro = next(k for k in keys if k["key"] == "model")
    v = next(v for v in dsv4pro["values"] if v["value"] == "dsv4-pro")
    assert v["description"] == "V4 Pro——强推理（直改）"
    assert v["group"] == "DeepSeek"


def test_task_attach_detach_by_slug_writes_audit(client: TestClient, admin_headers):
    # 挂摘测试的作品：本文件只上传 1 件（全量套件共享 20/h 上传配额，谨慎用）
    import os

    data = {"title": "挂摘演示件", "description": "实体管理测试", "demo_type": "web", "prompt": "挂摘"}
    data["tags"] = '["model:dsv4-flash"]'
    body = f"<!doctype html><html><body>{os.urandom(8).hex()}</body></html>".encode()
    # 管理员身份上传：绕开匿名 20/h 限流（全量套件共享配额，测试绝不占额度）
    r = client.post("/api/v1/demos", data=data, files={"file": ("index.html", body, "text/html")}, headers=admin_headers)
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]

    r = client.post("/api/v1/admin/tasks", json={"title": "挂摘测试题"}, headers=admin_headers)
    assert r.status_code == 201, r.text
    task = r.json()

    # 按 slug 挂载
    r = client.post(
        f"/api/v1/admin/tasks/{task['slug']}/demos",
        json={"demo_slugs": [slug]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["attached"] == 1
    tid = task["id"]
    assert _audit_count(client, admin_headers, "task", tid, action="attach") == 1

    # 详情返回归属 demo 列表
    detail = client.get(f"/api/v1/tasks/{task['slug']}").json()
    assert any(d["slug"] == slug for d in detail["demos"])

    # 按 slug 摘除 + 审计
    r = client.delete(f"/api/v1/admin/tasks/{task['slug']}/demos/slug/{slug}", headers=admin_headers)
    assert r.status_code == 204, r.text
    assert _audit_count(client, admin_headers, "task", tid, action="detach") == 1
    detail = client.get(f"/api/v1/tasks/{task['slug']}").json()
    assert all(d["slug"] != slug for d in detail["demos"])

    # 重复摘除 → 404（不在该题下）
    r = client.delete(f"/api/v1/admin/tasks/{task['slug']}/demos/slug/{slug}", headers=admin_headers)
    assert r.status_code == 404, r.text

    # 未知 slug → 整批 404（不静默半挂）
    r = client.post(
        f"/api/v1/admin/tasks/{task['slug']}/demos",
        json={"demo_slugs": ["no-such-demo-slug"]},
        headers=admin_headers,
    )
    assert r.status_code == 404, r.text


def test_task_update_reason_lands_audit(client: TestClient, admin_headers):
    r = client.post("/api/v1/admin/tasks", json={"title": "理由审计测试题"}, headers=admin_headers)
    task = r.json()
    r = client.put(
        f"/api/v1/admin/tasks/{task['slug']}",
        json={"description": "题面更新", "reason": "题面重写：补充评测口径"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    r = client.get(
        "/api/v1/admin/audit",
        params={"entity_type": "task", "entity_id": task["id"], "action": "update"},
        headers=admin_headers,
    )
    reasons = [e.get("reason") for e in r.json()["items"]]
    assert any("补充评测" in (x or "") for x in reasons), reasons


def test_batch_review_partial_failure_isolated(client: TestClient, admin_headers):
    """批量审核：单条 404/409 不拖垮整批——结果逐条回执（前端失败列表+重试的直接依据）。"""
    db = _db()
    from app.models import EntitySuggestion

    for i in range(2):
        db.add(
            EntitySuggestion(
                kind="new_model",
                payload=json.dumps({"name": f"batch-seed-{i}"}),
                confidence=0.7,
                source="ai",
                status="pending",
            )
        )
    db.commit()
    pend = db.query(EntitySuggestion).filter(EntitySuggestion.status == "pending").all()
    ids = [s.id for s in pend][:2]
    db.close()
    assert len(ids) >= 2, "种子建议不足"

    r = client.post(
        "/api/v1/admin/suggestions/batch-review",
        json={"action": "reject", "ids": ids + [999999]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] == len(ids)
    assert body["failed"] == 1
    failed = [x for x in body["results"] if not x["ok"]]
    assert failed[0]["id"] == 999999
    # 已处理过的再次批量 → 409 被逐条捕获而非整批 500
    r2 = client.post(
        "/api/v1/admin/suggestions/batch-review",
        json={"action": "approve", "ids": ids},
        headers=admin_headers,
    )
    assert r2.status_code == 200
    assert all(not x["ok"] for x in r2.json()["results"])