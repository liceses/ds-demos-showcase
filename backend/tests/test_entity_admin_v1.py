"""M3-B1..B3 实体管理端点测试：统一 PATCH（字段白名单）/ Task 挂摘 by slug / 批量审核。

制度红线对账：写操作走 service + 审计（断言 audit 落行）；白名单外 422；
批量审核单条失败不拖垮整批。

测试纪律（并行会话原稿纪律 + backend 收编增量）：
- 实体用 POST /admin/models 直造（**不走上传**——20/h 上传限速会把全量套件挤爆 429）；
  挂摘测试的管理员身份上传 1 件是例外（登录态绕开匿名限流，demos.py 已核实）。
- 建议用 db 直插 pending 行（test_challenge_v2 同款语义），且 ref_id 随机化——
  否则会与 test_governance_v2 的 suggestion create() 撞去重键（kind,ref_id,demo_id）。
- 批量审核只动自己种的建议：全局捞「前 2 条 pending」会驳回别的测试文件的夹具。
- Tag 测试用一次性探针值：dsv4-pro 等共享词表实体是其他文件的断言对象，不许改。
"""

import json
import os

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


def _probe_tag() -> dict:
    """DB 直插一次性标签值（key 独立不进注册词表，不碰共享实体）。"""
    from app.models import Tag

    db = _db()
    tag = Tag(key="m3b1probe", value=os.urandom(4).hex(), description="", group=None)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    out = {"id": tag.id, "value": tag.value}
    db.close()
    return out


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

    # T13 走查补锁（§31.1）：PATCH 的 reason 是审计元数据——必须落进审计行，
    # 不得恒为默认「编辑实体信息」（此前 model 分支把 reason 弹出后丢在地上）
    audit = client.get(
        f"/api/v1/admin/audit?entity_type=model&entity_id={m['id']}&page_size=5",
        headers=admin_headers,
    ).json()["items"]
    assert any((e.get("reason") or "") == "补描述" for e in audit), [e.get("reason") for e in audit]

    # 按 id 解析同样可达（id → slug → 别名统一解析链）
    r2 = client.patch(
        f"/api/v1/admin/entities/model/{m['id']}",
        json={"vendor": "ProbeVendor"},
        headers=admin_headers,
    )
    assert r2.status_code == 200, r2.text
    assert "vendor" in r2.json()["updated"]

    # 直改生效：详情读回新描述
    assert client.get(f"/api/v1/models/{m['slug']}").json()["description"] == "直改后的描述"


def test_patch_rejects_fields_outside_whitelist(client: TestClient, admin_headers):
    m = _mk_model(client, admin_headers, "patch-model-b")
    # Model 白名单外（demo_count 是派生只读；slug/resolution 仅合并流程内改）
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"demo_count": "999"}, headers=admin_headers)
    assert r.status_code == 422, r.text
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"slug": "hijack"}, headers=admin_headers)
    assert r.status_code == 422, r.text
    # 未知实体类型
    r = client.patch("/api/v1/admin/entities/alien/1", json={"x": "1"}, headers=admin_headers)
    assert r.status_code == 404, r.text
    # 非字符串值 → 422（白名单字段全是表单字符串语义，不给 500）
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"description": ["x"]}, headers=admin_headers)
    assert r.status_code == 422, r.text
    # 空/null 补丁 → 422（无字段变化不产生假审计）
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={}, headers=admin_headers)
    assert r.status_code == 422, r.text
    r = client.patch(f"/api/v1/admin/entities/model/{m['slug']}", json={"description": None}, headers=admin_headers)
    assert r.status_code == 422, r.text


def test_patch_tag_value_description_and_group(client: TestClient, admin_headers):
    tag = _probe_tag()
    r = client.patch(
        f"/api/v1/admin/entities/tag/{tag['id']}",
        json={"description": "探针标签描述（直改）", "group": "ProbeGroup"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"] == tag["value"]
    # 审计落行（tag 变更此前不落审计——本端点起落），且 entity_type=tag 可在审计接口过滤
    assert _audit_count(client, admin_headers, "tag", tag["id"], action="update") >= 1

    db = _db()
    from app.models import Tag

    row = db.get(Tag, tag["id"])
    out = {"description": row.description, "group": row.group}
    db.close()
    assert out == {"description": "探针标签描述（直改）", "group": "ProbeGroup"}


def test_task_attach_detach_by_slug_writes_audit(client: TestClient, admin_headers):
    # 挂摘测试的作品：管理员身份上传 1 件（登录态绕开匿名 20/h 限流，全量套件共享配额不占额度）
    data = {"title": "挂摘演示件", "description": "实体管理测试", "demo_type": "web", "prompt": "挂摘"}
    data["tags"] = '["model:dsv4-flash"]'
    body = f"<!doctype html><html><body>{os.urandom(8).hex()}</body></html>".encode()
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


def test_admin_task_detail_and_create_with_slugs(client: TestClient, admin_headers):
    """M3-B2：直建题带 demo_slugs 初始挂载 + 管理端详情（任何状态+归属全量含 pending）。"""
    from app.models import Demo

    approved_slug = f"m3b2-ok-{os.urandom(3).hex()}"
    pending_slug = f"m3b2-pending-{os.urandom(3).hex()}"
    db = _db()
    db.add(Demo(slug=approved_slug, title="已上架件", status="approved", prompt="p"))
    db.add(Demo(slug=pending_slug, title="待审件", status="pending", prompt="p"))
    db.commit()
    db.close()

    # 直建题初始挂载（slug 通道，响应带 attached）
    r = client.post(
        "/api/v1/admin/tasks",
        json={"title": "直建挂载题", "demo_slugs": [approved_slug]},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    assert r.json()["attached"] == 1
    created = r.json()

    # 把待审件也挂上，管理端详情必须看得见 pending（公开端点只出 approved）
    r = client.post(
        f"/api/v1/admin/tasks/{created['slug']}/demos",
        json={"demo_slugs": [pending_slug]},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text

    r = client.get(f"/api/v1/admin/tasks/{created['slug']}", headers=admin_headers)
    assert r.status_code == 200, r.text
    slugs = {d["slug"]: d["status"] for d in r.json()["demos"]}
    assert slugs.get(approved_slug) == "approved"
    assert slugs.get(pending_slug) == "pending"

    # fail-fast：未知 slug 建题 → 404 且不留已建好的空题
    r = client.post(
        "/api/v1/admin/tasks",
        json={"title": "不该存在的题", "demo_slugs": ["no-such-demo"]},
        headers=admin_headers,
    )
    assert r.status_code == 404, r.text
    r = client.get("/api/v1/admin/tasks", params={"q": "不该存在的题"}, headers=admin_headers)
    assert r.json()["total"] == 0


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

    # ref_id 随机化：去重键 (kind, ref_id, demo_id) 不与 test_governance_v2 的 create() 撞车
    rid = int.from_bytes(os.urandom(3), "big") + 10_000_000
    seeds = []
    for i in range(2):
        s = EntitySuggestion(
            kind="new_model",
            payload=json.dumps({"name": f"batch-seed-{rid}-{i}"}),
            confidence=0.7,
            source="ai",
            status="pending",
            ref_id=rid,
        )
        db.add(s)
        seeds.append(s)
    db.commit()
    ids = [s.id for s in seeds]
    db.close()

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