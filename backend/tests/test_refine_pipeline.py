"""type:demo 拆分流水线（规则 → 候选 → 人工批准）。

守住三件事：
- 规则**只出建议**，批准前绝不改标签；
- 命中不到就如实不提案（不硬塞值把垃圾桶换个名字继续装）；
- 批准时只换 `type` 键，其余标签一律不动。
"""

import json
import os

from app.models import Demo, Tag


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags, prompt=""):
    data = {
        "title": title,
        "description": "拆分流水线用例",
        "demo_type": "web",
        "tags": json.dumps(tags, ensure_ascii=False),
        "prompt": prompt,
    }
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _demo(slug):
    db = _db()
    try:
        return db.query(Demo).filter(Demo.slug == slug).first()
    finally:
        db.close()


def test_scan_proposes_only_when_signal_exists(client):
    from app.services import refine_service

    _upload(client, "引力轨道仿真", ["model:dsv4-flash", "type:demo"], prompt="做一个物理仿真：行星轨道引力模拟")
    _upload(client, "沉默作品", ["model:dsv4-flash", "type:demo"], prompt="随便做点东西")

    db = _db()
    try:
        props = refine_service.scan(db, limit=200, min_confidence=0.6)
        targets = {p.add for p in props}
        slugs = {p.slug for p in props}
    finally:
        db.close()

    assert "simulation" in targets, targets
    # 没信号的那件必须**不在**提案里 —— 这是"不硬塞值"的可证伪断言
    silent = _demo(client.get("/api/v1/demos?q=沉默作品").json()["items"][0]["slug"])
    assert silent.slug not in slugs


def test_preview_endpoint_is_admin_only_and_does_not_write(client):
    from app.database import SessionLocal
    from app.models import EntitySuggestion

    client.cookies.clear()
    assert client.get("/api/v1/admin/type-demo/preview").status_code == 401

    login = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": "Bearer " + login.json()["access_token"]}
    s = SessionLocal()
    try:
        before = s.query(EntitySuggestion).filter(EntitySuggestion.kind == "retag_demo").count()
    finally:
        s.close()

    r = client.get("/api/v1/admin/type-demo/preview?min_confidence=0.6", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["proposed"] >= 1
    assert "simulation" in body["by_target"]
    assert body["stats"]["type_dist"], "type 分布没数据"

    s = SessionLocal()
    try:
        after = s.query(EntitySuggestion).filter(EntitySuggestion.kind == "retag_demo").count()
    finally:
        s.close()
    assert after == before, "预览端点不该写库"


def test_queue_then_approve_replaces_type_only(client, admin_headers):
    slug = _upload(
        client,
        "钢琴节奏游戏",
        ["model:dsv4-flash", "type:demo", {"key": "game", "value": "mc", "description": "我的世界"}],
        prompt="做一个钢琴节奏音乐小游戏",
    )
    demo_id = _demo(slug).id

    q = client.post("/api/v1/admin/type-demo/queue?min_confidence=0.6", headers=admin_headers)
    assert q.status_code == 200, q.text
    assert q.json()["queued"] >= 1

    inbox = client.get("/api/v1/admin/suggestions?status=pending", headers=admin_headers).json()
    items = [s for s in inbox["items"] if s["kind"] == "retag_demo" and s["payload"].get("demo_id") == demo_id]
    assert items, [s["kind"] for s in inbox["items"]]
    s0 = items[0]
    assert s0["source"] == "inferred" and s0["confidence"] >= 0.6
    assert s0["payload"]["remove"] == "demo" and s0["payload"]["matched"]

    appr = client.post(f"/api/v1/admin/suggestions/{s0['id']}/review", json={"action": "approve"}, headers=admin_headers)
    assert appr.status_code == 200, appr.text
    assert "type" in appr.json()["result"], appr.json()

    d = client.get(f"/api/v1/demos/{slug}").json()
    types = sorted(t["value"] for t in d["tags"] if t["key"] == "type")
    assert "demo" not in types, types
    assert "music" in types, types
    # 其余键必须不动（model 还在）
    assert any(t["key"] == "model" for t in d["tags"]), d["tags"]
    assert any(t["key"] == "game" for t in d["tags"]), "game 被误删（只该动 type）"

    # 新固定值应自动进词表（type 是 fixed 键，否则下次上传选不到）
    db = _db()
    try:
        assert db.query(Tag).filter(Tag.key == "type", Tag.value == "music").first() is not None
    finally:
        db.close()


def test_queue_is_idempotent(client, admin_headers):
    _upload(client, "二维码转换工具", ["model:dsv4-flash", "type:demo"], prompt="二维码生成与格式转换工具")
    a = client.post("/api/v1/admin/type-demo/queue?min_confidence=0.6", headers=admin_headers).json()
    b = client.post("/api/v1/admin/type-demo/queue?min_confidence=0.6", headers=admin_headers).json()
    assert b["queued"] == 0, (a, b)  # 同 demo 的 pending 不重复堆


def test_reject_changes_nothing(client, admin_headers):
    slug = _upload(client, "数据点云可视化", ["model:dsv4-flash", "type:demo"], prompt="点云数据可视化图表")
    demo_id = _demo(slug).id
    client.post("/api/v1/admin/type-demo/queue?min_confidence=0.6", headers=admin_headers)
    inbox = client.get("/api/v1/admin/suggestions?status=pending", headers=admin_headers).json()
    target = next(s for s in inbox["items"] if s["kind"] == "retag_demo" and s["payload"].get("demo_id") == demo_id)

    r = client.post(f"/api/v1/admin/suggestions/{target['id']}/review", json={"action": "reject"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "rejected"

    d = client.get(f"/api/v1/demos/{slug}").json()
    types = [t["value"] for t in d["tags"] if t["key"] == "type"]
    assert types == ["demo"], f"驳回后标签被改了：{types}"
