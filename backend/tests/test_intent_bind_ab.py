"""身份绑定闭环 A+B：用户申请只进候选，管理员 approve 才回挂身份。

对照 v2 B4′（test_challenge_v2.py）与 redesign-v3 账本：
  创建/维护分离、候选不外泄、写操作走既有表与 service、契约只增不改。

闭环 A（标签申请回挂）：
  1. 上传成功后 POST /tags/suggestions {key,value,demo_id} 只写 pending，不建 Tag
  2. 未批准的 fixed 值不得出现在公开词表 / 公开筛选 / 作品 tags
  3. 用户不得把未批准 fixed 值写进 POST /demos 的 tags JSON（_resolve_tag 挡掉）
  4. 管理员 approve → 建 Tag + 补挂 DemoTag；GET /demos/{slug} tags 含该值
  5. 若 key=model，approve 后必须 sync_demo_models：demo.models 含对应实体
  6. 未带 demo_id 的旧路径：approve 建 Tag，但不挂到任何作品

闭环 B（上传提议新题）：
  1. POST /demos 带 propose_task={title,description} → 201，只落 pending
     EntitySuggestion kind=new_task、source=user、confidence≥0.6、demo_id=该作品
  2. 上传当时不得出现 Task 行、不得出现 DemoTask
  3. 管理员 approve 该建议（现有 _execute）→ Task 存在且该 demo 已挂题
  4. 不带 propose_task → 零行为变化（与 test_no_task_means_no_suggestion 同口径）
  5. 非法 propose_task（有字段但缺 title）→ 422，且不得留下孤儿 demo

红线：禁止新表；禁止新 kind 名（用 new_task）；禁止未批准 fixed 值进 tags JSON。
"""

import json
import os

from app.models import Demo, DemoTag, EntitySuggestion, Tag, Task


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, task=None, model="dsv4-flash", tags=None, propose_task=None):
    """对照 test_challenge_v2._upload：单文件 HTML + model 固定值；增量只加 propose_task。"""
    data = {
        "title": title,
        "description": "意图绑定闭环测试",
        "demo_type": "web",
        "prompt": "做一个会被身份绑定测试复用的提示词内容，包含 canvas 与交互。",
        "tags": tags or f'["model:{model}", "type:effect"]',
    }
    if task:
        data["task"] = task
    if propose_task is not None:
        data["propose_task"] = (
            propose_task if isinstance(propose_task, str) else json.dumps(propose_task, ensure_ascii=False)
        )
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    return client.post("/api/v1/demos", data=data, files=files)


def _demo_row(slug: str) -> tuple[int, str]:
    db = _db()
    row = db.query(Demo).filter(Demo.slug == slug).first()
    assert row is not None, f"作品未落库: {slug}"
    out = (row.id, row.slug)
    db.close()
    return out


def _pending_new_task(demo_id: int):
    db = _db()
    row = (
        db.query(EntitySuggestion)
        .filter(
            EntitySuggestion.kind == "new_task",
            EntitySuggestion.demo_id == demo_id,
            EntitySuggestion.status == "pending",
        )
        .first()
    )
    if row is None:
        db.close()
        return None, None, None, None
    payload = {}
    try:
        payload = json.loads(row.payload or "{}")
    except json.JSONDecodeError:
        payload = {}
    out = (row.id, row.source, row.confidence, payload)
    db.close()
    return out


def _tag_exists(key: str, value: str) -> bool:
    db = _db()
    hit = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    db.close()
    return hit is not None


def _public_tag_values(client, key: str) -> set[str]:
    keys = client.get("/api/v1/tags/tag-keys").json()
    for k in keys:
        if k["key"] == key:
            return {v["value"] for v in k.get("values") or []}
    return set()


def _demo_has_tag(detail: dict, key: str, value: str) -> bool:
    return any(t.get("key") == key and t.get("value") == value for t in detail.get("tags") or [])


# ---------------- 契约只增：创建结果带 id（前端回挂 demo_id 用） ----------------


def test_demo_create_result_includes_id(client, admin_headers):
    """DemoCreateResult 只允许增量加 id：201 体必须带与库一致的作品 id。"""
    r = _upload(client, f"bind-id-{os.urandom(3).hex()}")
    assert r.status_code == 201, r.text
    body = r.json()
    assert "slug" in body and body.get("created") is not False
    assert "id" in body and isinstance(body["id"], int) and body["id"] > 0, body
    did, _ = _demo_row(body["slug"])
    assert body["id"] == did


# ---------------- 闭环 A ----------------


def test_tag_suggestion_with_demo_id_approve_attaches_and_syncs_model(client, admin_headers):
    """Given 上传后申请 model 新值并带 demo_id；When approve；Then tags + models 都回挂。"""
    r = _upload(client, f"tag-attach-{os.urandom(3).hex()}")
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    did, _ = _demo_row(slug)
    value = f"ib-model-{os.urandom(4).hex()}"

    sug = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "model", "value": value, "demo_id": did, "description": "身份绑定探针型号"},
    )
    assert sug.status_code == 201, sug.text
    sid = sug.json()["id"]
    assert sug.json()["status"] == "pending"
    assert sug.json()["demo_id"] == did
    assert not _tag_exists("model", value), "申请阶段不得建 Tag"

    # 未批准：公开词表 / 公开详情 / 作品卡 / 筛选 都不得出现该值
    assert value not in _public_tag_values(client, "model")
    assert client.get(f"/api/v1/tags/model:{value}").status_code == 404
    before = client.get(f"/api/v1/demos/{slug}").json()
    assert not _demo_has_tag(before, "model", value), before.get("tags")
    assert all(m.get("name") != value for m in before.get("models") or [])
    listed = client.get("/api/v1/demos", params={"tag": f"model:{value}", "page_size": 100}).json()["items"]
    assert all(d["slug"] != slug for d in listed), "未批准值进了公开筛选"

    res = client.post(
        f"/api/v1/tags/admin/suggestions/{sid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"
    assert _tag_exists("model", value)

    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert _demo_has_tag(detail, "model", value), f"批准后作品 tags 未回挂: {detail.get('tags')}"
    assert any(m.get("name") == value for m in detail.get("models") or []), (
        f"key=model 批准后未 sync_demo_models: {detail.get('models')}"
    )

    assert value in _public_tag_values(client, "model")
    tagged = client.get("/api/v1/demos", params={"tag": f"model:{value}", "page_size": 100}).json()["items"]
    assert any(d["slug"] == slug for d in tagged), "批准后公开标签筛选仍找不到该作品"

    # 实体筛选同样要通（demo_models 双写）
    model_slug = next(m["slug"] for m in detail["models"] if m["name"] == value)
    by_model = client.get("/api/v1/demos", params={"model": model_slug, "page_size": 100}).json()["items"]
    assert any(d["slug"] == slug for d in by_model), "批准后 ?model= 筛选未挂上该作品"


def test_tag_suggestion_non_model_with_demo_id_attaches_tag_only(client, admin_headers):
    """带 demo_id 申请非 model 键：approve 后详情 tags 含该值，不必长出 models 实体。"""
    r = _upload(client, f"plugin-attach-{os.urandom(3).hex()}")
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    did, _ = _demo_row(slug)
    value = f"ib-plugin-{os.urandom(4).hex()}"

    sug = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "plugin", "value": value, "demo_id": did, "description": "非 model 回挂探针"},
    )
    assert sug.status_code == 201, sug.text
    sid = sug.json()["id"]
    assert not _tag_exists("plugin", value)

    before = client.get(f"/api/v1/demos/{slug}").json()
    assert not _demo_has_tag(before, "plugin", value)

    res = client.post(
        f"/api/v1/tags/admin/suggestions/{sid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert _demo_has_tag(detail, "plugin", value), f"批准后作品 tags 未回挂: {detail.get('tags')}"
    listed = client.get("/api/v1/demos", params={"tag": f"plugin:{value}", "page_size": 100}).json()["items"]
    assert any(d["slug"] == slug for d in listed), "批准后公开筛选找不到该作品"


def test_tag_suggestion_without_demo_id_does_not_attach(client, admin_headers):
    """未带 demo_id 的旧路径：approve 建词表值，但不回挂到作品。"""
    r = _upload(client, f"old-path-{os.urandom(3).hex()}")
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    value = f"ib-plugin-{os.urandom(4).hex()}"

    sug = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "plugin", "value": value, "description": "无 demo_id 的旧申请路径"},
    )
    assert sug.status_code == 201, sug.text
    sid = sug.json()["id"]
    assert sug.json().get("demo_id") in (None, 0)

    res = client.post(
        f"/api/v1/tags/admin/suggestions/{sid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    assert _tag_exists("plugin", value), "旧路径批准后应建 Tag"

    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert not _demo_has_tag(detail, "plugin", value), "未带 demo_id 却把值挂到了作品"
    db = _db()
    n = (
        db.query(DemoTag)
        .join(Tag, Tag.id == DemoTag.tag_id)
        .filter(Tag.key == "plugin", Tag.value == value)
        .count()
    )
    db.close()
    assert n == 0, "无 demo_id 的申请批准后不应产生任何 DemoTag"


def test_unapproved_fixed_value_cannot_enter_tags_json_or_public_filter(client, admin_headers):
    """红线：用户不能把未批准 fixed 值写进 tags JSON；pending 值不得进公开筛选。"""
    value = f"ib-unapproved-{os.urandom(4).hex()}"
    sug = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "model", "value": value, "description": "未批准不得外泄"},
    )
    assert sug.status_code == 201, sug.text
    assert not _tag_exists("model", value)
    assert value not in _public_tag_values(client, "model")
    assert client.get(f"/api/v1/tags/model:{value}").status_code == 404

    title = f"sneak-unapproved-{os.urandom(3).hex()}"
    r = _upload(client, title, tags=json.dumps([f"model:{value}", "type:effect"]))
    assert r.status_code == 422, r.text
    assert not _tag_exists("model", value), "422 路径不得顺便建 Tag"
    listed = client.get("/api/v1/demos", params={"tag": f"model:{value}", "page_size": 100}).json()["items"]
    assert listed == [], "未批准 fixed 值出现在公开筛选"


# ---------------- 闭环 B ----------------


def test_propose_task_queues_new_task_without_creating_task(client, admin_headers):
    """带 propose_task 上传 → 只落 new_task 候选，不建 Task、不挂题。"""
    title = f"身份绑定新题-{os.urandom(3).hex()}"
    desc = "同一题面比不同模型（用户提议，待审）"
    demo_title = f"提议新题作品-{os.urandom(3).hex()}"
    r = _upload(
        client,
        demo_title,
        propose_task={"title": title, "description": desc, "category": "仿真"},
    )
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    did, _ = _demo_row(slug)

    sid, src, conf, payload = _pending_new_task(did)
    assert sid, "propose_task 未写入 pending EntitySuggestion kind=new_task"
    assert src == "user", src
    assert conf is not None and conf >= 0.6, f"confidence 为 NULL 或低于收件箱阈值: {conf}"
    assert (payload or {}).get("title") == title, payload

    db = _db()
    assert db.query(Task).filter(Task.title == title).first() is None, "用户提议就建题 = Benchmark 可被任意塞入"
    from app.models import DemoTask

    assert db.query(DemoTask).filter(DemoTask.demo_id == did).first() is None, "提议阶段不得产生 DemoTask"
    db.close()

    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert not detail.get("tasks"), f"未批准就挂了题: {detail.get('tasks')}"

    items = client.get("/api/v1/admin/suggestions", headers=admin_headers).json()["items"]
    assert sid in {x["id"] for x in items}, "用户出题请求在收件箱默认视图不可见"
    assert client.get("/api/v1/admin/suggestions", headers=admin_headers).json()["pending_by_kind"].get("new_task", 0) >= 1


def test_approve_propose_task_creates_task_and_attaches(client, admin_headers):
    """批准 new_task 建议 → 真建题 + 该 demo 已挂题。"""
    title = f"批准后才上榜-{os.urandom(3).hex()}"
    demo_title = f"待批准出题作品-{os.urandom(3).hex()}"
    r = _upload(
        client,
        demo_title,
        propose_task={"title": title, "description": "批准后进入同题对比"},
    )
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    did, _ = _demo_row(slug)
    sid, _, _, _ = _pending_new_task(did)
    assert sid, "候选未入队，无法测批准路径"

    res = client.post(
        f"/api/v1/admin/suggestions/{sid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text

    db = _db()
    task = db.query(Task).filter(Task.title == title).first()
    assert task is not None, "批准后仍无 Task 行"
    tslug = task.slug
    db.close()

    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert any(t["slug"] == tslug for t in detail.get("tasks") or []), f"批准后作品未挂题: {detail.get('tasks')}"
    task_detail = client.get(f"/api/v1/tasks/{tslug}").json()
    assert slug in {d["slug"] for d in task_detail["demos"]}, "批准后题目详情未包含该作品"


def test_no_propose_task_means_no_new_task_suggestion(client, admin_headers):
    """不带 propose_task 的普通上传不受影响（零行为变化）。"""
    r = _upload(client, f"plain-upload-{os.urandom(3).hex()}")
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    did, _ = _demo_row(slug)
    db = _db()
    n = (
        db.query(EntitySuggestion)
        .filter(EntitySuggestion.demo_id == did, EntitySuggestion.kind == "new_task")
        .count()
    )
    total = db.query(EntitySuggestion).filter(EntitySuggestion.demo_id == did).count()
    db.close()
    assert n == 0
    assert total == 0, "不带 propose_task / task 的上传不应产生任何建议"


def test_invalid_propose_task_fails_before_creating_demo(client, admin_headers):
    """有 propose_task 则 title 必填：非法 422，且校验在解压之前（不留孤儿 demo）。"""
    title = f"缺题名孤儿探针-{os.urandom(3).hex()}"
    r = _upload(client, title, propose_task={"title": "", "description": "只有题面没有题名"})
    assert r.status_code == 422, r.text
    db = _db()
    assert db.query(Demo).filter(Demo.title == title).first() is None, "校验晚于建 demo → 留了孤儿"
    db.close()
