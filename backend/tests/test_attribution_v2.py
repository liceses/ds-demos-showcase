"""Q2 第三步：归属工作台（兜底位 → 真实型号）。

核心不变式：**归属必须回写标签** —— `update_demo` 会用 `_set_demo_tags → sync_demo_models`
从标签重新派生实体，只改 `demo_models` 的归属会在作者下次编辑时静默退回兜底位。
"""

import json
import os

from app.models import Demo, Model


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags, hint=None):
    data = {"title": title, "description": "归属测试", "demo_type": "web", "tags": json.dumps(tags, ensure_ascii=False)}
    if hint:
        data["model_hint"] = hint
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _demo_id(slug: str) -> int:
    """作品详情序列化不含 id，测试按 slug 直查（工作台数据源本身带 id，不依赖此函数）。"""
    db = _db()
    try:
        return db.query(Demo).filter(Demo.slug == slug).first().id
    finally:
        db.close()


def _ensure_fallbacks():
    from app.services import model_service

    db = _db()
    model_service.ensure_fallback_models(db)
    db.close()


def _exact_model(name="dsv4-pro"):
    """确保一个 exact 真实型号实体存在并返回其信息。

    实体是上传时懒建的 —— 本文件的作品只挂兜底位，所以必须显式把目标型号建出来
    （等价于管理端「新建模型」后的状态）。
    """
    from app.services import model_service

    db = _db()
    try:
        m, _created = model_service.get_or_create_model(db, name, vendor="DeepSeek", status="active")
        assert m.resolution == "exact", m.resolution
        db.commit()
        return {"id": m.id, "slug": m.slug, "name": m.name}
    finally:
        db.close()


def test_attribution_pending_lists_fallback_works(client):
    """待归属清单：兜底实体下的作品带证据（model_hint）与规则预填目标。"""
    _ensure_fallbacks()
    _exact_model()  # guess_target 只在 exact 实体里找命中
    slug = _upload(client, "归属清单用例", ["model:unspecified", "type:game"], hint="看着像 dsv4-pro 出的，没人确认过")

    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": "Bearer " + login.json()["access_token"]}
    body = client.get("/api/v1/admin/attribution/pending", headers=h).json()

    grp = next((g for g in body["groups"] if g["model"]["slug"] == "unspecified"), None)
    assert grp is not None, [g["model"]["slug"] for g in body["groups"]]
    item = next((d for d in grp["demos"] if d["slug"] == slug), None)
    assert item is not None
    assert item["model_hint"].startswith("看着像")
    # 规则预填：hint 里出现已知型号名 → 给出建议目标（仅预填，人可改）
    assert item["guess"] and item["guess"]["name"] == "dsv4-pro", item["guess"]
    assert any(t["slug"] == "dsv4-pro" for t in body["targets"]), "可选目标里没有真实型号"


def test_attribute_moves_tag_and_entity(client, admin_headers):
    """归属后：标签与实体**同步**变成目标型号，兜底标签摘除。"""
    _ensure_fallbacks()
    slug = _upload(client, "归属迁移用例", ["model:unspecified", "type:game"])
    target = _exact_model()
    assert target, "种子里没有 dsv4-pro？"

    r = client.post(
        "/api/v1/admin/attribution",
        json={"demo_ids": [_demo_id(slug)], "target_id": target["id"], "reason": "仿真核对后归属"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["moved"] == 1

    d = client.get(f"/api/v1/demos/{slug}").json()
    assert [m["slug"] for m in d["models"]] == [target["slug"]], d["models"]
    assert not any(t["key"] == "model" and t["value"] == "unspecified" for t in d["tags"]), d["tags"]
    assert any(t["key"] == "model" and t["value"] == target["name"] for t in d["tags"]), "标签没回写 → 下次编辑会退回兜底"


def test_attribution_survives_later_tag_edit(client, admin_headers):
    """归属必须扛住作者后续编辑：用「当前 tags 原样再提交」复现编辑路径。

    这是本功能的命门 —— 若归属只改了 demo_models，这条用例会退回 unspecified。
    """
    _ensure_fallbacks()
    slug = _upload(client, "归属后编辑用例", ["model:unspecified", "type:effect"])
    target = _exact_model()
    demo_id = _demo_id(slug)
    assert client.post(
        "/api/v1/admin/attribution",
        json={"demo_ids": [demo_id], "target_id": target["id"]},
        headers=admin_headers,
    ).status_code == 200

    # 模拟编辑：把归属后的 tags 原样再 PUT 一次（编辑页就是这么回传全量 tags 的）
    # author / version-of 是系统内部标签、不来自用户选择，编辑页回传时会剔除
    tags_now = [
        f"{t['key']}:{t['value']}"
        for t in client.get(f"/api/v1/demos/{slug}").json()["tags"]
        if t["key"] not in ("author", "version-of")
    ]
    files = {"file": ("index.html", b"<!doctype html><body>edited</body></html>", "text/html")}
    r = client.put(
        f"/api/v1/demos/{slug}",
        data={"tags": json.dumps(tags_now, ensure_ascii=False)},
        files=files,
        headers=admin_headers,
    )
    assert r.status_code == 204, r.text  # 更新接口按契约返回 204 No Content

    d = client.get(f"/api/v1/demos/{slug}").json()
    assert [m["slug"] for m in d["models"]] == [target["slug"]], "编辑后归属被打回兜底位（未回写标签）"


def test_attribute_rejects_fallback_target(client, admin_headers):
    """目标必须是已确认真实型号：往另一个兜底位归属没有意义，应 422。"""
    _ensure_fallbacks()
    slug = _upload(client, "错误目标用例", ["model:unspecified"])
    demo_id = _demo_id(slug)
    db = _db()
    unspec_id = db.query(Model).filter(Model.slug == "unspecified").first().id
    db.close()
    r = client.post(
        "/api/v1/admin/attribution",
        json={"demo_ids": [demo_id], "target_id": unspec_id},
        headers=admin_headers,
    )
    assert r.status_code == 422, r.text
    assert "真实型号" in r.json()["detail"]


def test_attribute_is_idempotent_and_audited(client, admin_headers):
    """重复归属同一目标不再迁移；每次操作都留审计（可回溯谁把谁归到哪）。"""
    _ensure_fallbacks()
    slug = _upload(client, "幂等审计用例", ["model:unspecified"])
    target = _exact_model()
    demo_id = _demo_id(slug)
    payload = {"demo_ids": [demo_id], "target_id": target["id"], "reason": "幂等验证"}

    first = client.post("/api/v1/admin/attribution", json=payload, headers=admin_headers)
    assert first.status_code == 200 and first.json()["moved"] == 1
    second = client.post("/api/v1/admin/attribution", json=payload, headers=admin_headers)
    assert second.status_code == 200 and second.json()["moved"] == 0, second.json()

    audit = client.get("/api/v1/admin/audit?limit=20", headers=admin_headers).json()["items"]
    rows = [a for a in audit if a["action"] == "attribute" and a["after"]["moved"] == 1]
    assert rows, [a["action"] for a in audit[:6]]
    assert rows[0]["after"]["target"] == target["slug"]
    assert rows[0]["reason"] == "幂等验证"
    assert rows[0]["actor_id"] is not None
    # 空操作不留审计噪音：第二次 moved=0 不应产生新记录
    assert not [a for a in audit if a["action"] == "attribute" and a["after"]["moved"] == 0], audit[:4]


def test_attribution_requires_admin(client):
    """未登录不能看清单、也不能归属（防越权改归属）。

    conftest 的 `client` 是 session 级、会带上前面用例登录后的 cookie，
    断言 401 前必须清 cookie（本仓已记过的坑）。
    """
    from app.database import SessionLocal

    _ensure_fallbacks()
    client.cookies.clear()
    assert client.get("/api/v1/admin/attribution/pending").status_code == 401
    s = SessionLocal()
    try:
        tid = s.query(Model).filter(Model.name == "dsv4-pro").first()
    finally:
        s.close()
    assert client.post("/api/v1/admin/attribution", json={"demo_ids": [1], "target_id": tid.id}).status_code == 401
