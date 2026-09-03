"""B4 治理巡检：读数正确、可执行项能生成候选、不可执行项拒绝造假动作。"""

import json
import os

from app.models import Demo, EntitySuggestion


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags, prompt=""):
    data = {"title": title, "description": "巡检用例", "demo_type": "web", "tags": json.dumps(tags, ensure_ascii=False)}
    if prompt:
        data["prompt"] = prompt
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _demo_id(slug: str) -> int:
    db = _db()
    try:
        return db.query(Demo).filter(Demo.slug == slug).first().id
    finally:
        db.close()


def _suggest_count(kind: str) -> int:
    db = _db()
    try:
        return db.query(EntitySuggestion).filter(EntitySuggestion.kind == kind).count()
    finally:
        db.close()


def test_inspection_run_shape_and_readonly(client, admin_headers):
    before = _suggest_count("retag_demo")
    r = client.get("/api/v1/admin/inspection", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    ids = {c["id"] for c in body["checks"]}
    assert len(ids) == 9, ids
    assert all(c["can_queue"] == (c["level"] == "action") for c in body["checks"]), "可执行标记与级别不一致"
    # 巡检本身只读：跑一遍不该产生任何候选
    assert _suggest_count("retag_demo") == before


def test_inspection_requires_admin(client):
    client.cookies.clear()
    assert client.get("/api/v1/admin/inspection").status_code == 401
    assert client.post("/api/v1/admin/inspection/type_missing/queue").status_code == 401


def test_type_missing_detected_and_filled(client, admin_headers):
    """没有 type 的作品被查出 → 生成候选 → 批准后**只补值不动其他标签**。"""
    slug = _upload(client, "巡检缺类型用例", ["model:dsv4-flash"], prompt="做一个钢琴节奏音乐播放器")
    demo_id = _demo_id(slug)

    body = client.get("/api/v1/admin/inspection", headers=admin_headers).json()
    check = next(c for c in body["checks"] if c["id"] == "type_missing")
    assert check["count"] >= 1 and check["can_queue"] is True

    q = client.post("/api/v1/admin/inspection/type_missing/queue?min_confidence=0.8", headers=admin_headers)
    assert q.status_code == 200, q.text
    assert q.json()["queued"] >= 1

    inbox = client.get("/api/v1/admin/suggestions?status=pending", headers=admin_headers).json()
    mine = [s for s in inbox["items"] if s["kind"] == "retag_demo" and s["payload"].get("demo_id") == demo_id]
    assert mine, [s["payload"] for s in inbox["items"][:3]]
    assert mine[0]["payload"]["remove"] == [], "补值不该删任何标签"

    appr = client.post(f"/api/v1/admin/suggestions/{mine[0]['id']}/review", json={"action": "approve"}, headers=admin_headers)
    assert appr.status_code == 200, appr.text
    d = client.get(f"/api/v1/demos/{slug}").json()
    types = sorted(t["value"] for t in d["tags"] if t["key"] == "type")
    assert types == ["music"], types
    assert any(t["key"] == "model" for t in d["tags"]), "其他标签被动过了"

    # 再巡检一次，这件不该再出现在缺 type 里
    again = client.get("/api/v1/admin/inspection", headers=admin_headers).json()
    slugs = {s.get("slug") for s in next(c for c in again["checks"] if c["id"] == "type_missing").get("samples", [])}
    assert slug not in slugs


def test_type_multi_converges_by_dropping_demo(client, admin_headers):
    """多值含 demo：批准只删 demo、保留更具体的值（机械判断，置信度给到 0.95）。"""
    slug = _upload(client, "巡检多值用例", ["model:dsv4-flash", "type:demo", "type:game"])
    demo_id = _demo_id(slug)

    q = client.post("/api/v1/admin/inspection/type_multi/queue", headers=admin_headers)
    assert q.status_code == 200, q.text
    assert q.json()["proposed"] >= 1

    inbox = client.get("/api/v1/admin/suggestions?status=pending", headers=admin_headers).json()
    mine = next((s for s in inbox["items"] if s["kind"] == "retag_demo" and s["payload"].get("demo_id") == demo_id), None)
    assert mine is not None
    assert mine["confidence"] == 0.95
    assert mine["payload"]["remove"] == ["demo"] and mine["payload"]["add"] == "game"

    client.post(f"/api/v1/admin/suggestions/{mine['id']}/review", json={"action": "approve"}, headers=admin_headers)
    d = client.get(f"/api/v1/demos/{slug}").json()
    types = sorted(t["value"] for t in d["tags"] if t["key"] == "type")
    assert types == ["game"], types


def test_non_actionable_check_refuses_to_queue(client, admin_headers):
    """没有自动补救动作的项必须拒绝 —— 不能为了给按钮而造一个假动作。"""
    before = _suggest_count("retag_demo")
    r = client.post("/api/v1/admin/inspection/no_prompt/queue", headers=admin_headers)
    assert r.status_code == 422, r.text
    assert "没有可自动执行" in r.json()["detail"]
    assert _suggest_count("retag_demo") == before


def test_queue_is_idempotent(client, admin_headers):
    _upload(client, "巡检幂等用例", ["model:dsv4-flash"], prompt="二维码生成与格式转换工具")
    a = client.post("/api/v1/admin/inspection/type_missing/queue?min_confidence=0.8", headers=admin_headers).json()
    b = client.post("/api/v1/admin/inspection/type_missing/queue?min_confidence=0.8", headers=admin_headers).json()
    assert a["queued"] >= 1
    assert b["queued"] == 0, (a, b)
