"""`/peek/{kind}/{ident}` 紧凑摘要端点。

新公开端点必须有测试（项目规矩）。重点锁四件事：
1. 三种 kind 都出结构化摘要；
2. 非法 kind → 422、不存在 → 404（不猜、不 500）；
3. 题目无描述时回落题面摘录，且**显式标注来源**（不冒充作者描述）；
4. 退役实体不出现在 demo 的 models 里（与全站口径一致）。
"""

import json
import os

from app.models import Model


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _ensure_value(value: str) -> None:
    """`model:` 是固定键，值必须先在词表里（422 是正确行为，不是 bug）。"""
    from app.services import model_service

    db = _db()
    try:
        model_service.ensure_tag_value(db, value)
        db.commit()
    finally:
        db.close()


def _upload(client, title, tags, prompt=""):
    _ensure_value(tags[0].split(":")[1])
    # tags 是 multipart Form 字段，必须传 JSON 字符串而不是 Python list
    data = {"title": title, "description": "peek 用例", "demo_type": "web", "tags": json.dumps(tags), "prompt": prompt}
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(6).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def test_peek_model_carries_score_and_votes(client):
    slug = _upload(client, "Peek Model A", ["model:peek-a", "type:game"])
    r = client.get("/api/v1/peek/model/peek-a")
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["kind"] == "model" and m["slug"] == "peek-a"
    # score/votes/sample_level 必须与 §25.1 的口径一致地存在
    for k in ("score", "votes", "sample_level", "demo_count", "full_path"):
        assert k in m, k
    assert m["full_path"] == "/models/peek-a"
    assert isinstance(m["demos"], list) and m["demos"][0]["slug"] == slug


def test_peek_task_uses_prompt_excerpt_when_no_description(client):
    slug = _upload(client, "Peek Task Brief", ["model:peek-b", "type:game"], prompt="做一个会呼吸的星云可视化，单文件 HTML")
    db = _db()
    try:
        from app.models import Demo, DemoTask, Task

        d = db.query(Demo).filter(Demo.slug == slug).first()
        t = Task(slug="peek-task-x", title="Peek Task X", description="", status="active")
        db.add(t)
        db.flush()
        db.add(DemoTask(task_id=t.id, demo_id=d.id))
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/peek/task/peek-task-x")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["kind"] == "task"
    assert t["demo_count"] == 1 and t["model_count"] == 1, t
    # 作者没写题面 → 回落提示词，并显式标注来源
    assert t["is_prompt_excerpt"] is True, t
    assert "会呼吸的星云" in t["description"], t["description"]

    # 作者写了题面时不得冒充摘录
    db = _db()
    try:
        from app.models import Task as T

        row = db.query(T).filter(T.slug == "peek-task-x").first()
        row.description = "请按题面做一个星云可视化"
        db.commit()
    finally:
        db.close()
    t2 = client.get("/api/v1/peek/task/peek-task-x").json()
    assert t2["is_prompt_excerpt"] is False and "请按题面" in t2["description"], t2


def test_peek_demo_excludes_deprecated_models(client):
    slug = _upload(client, "Peek Demo C", ["model:peek-c", "type:game"])
    d = client.get(f"/api/v1/peek/demo/{slug}").json()
    assert d["kind"] == "demo" and d["name"], d
    assert [m["slug"] for m in d["models"]] == ["peek-c"], d["models"]
    assert d["full_path"] == f"/demo/{slug}"

    # 用**本用例自建**的实体做退役实验：动 seed 的 dsv4-flash 会污染整个 session 库
    db = _db()
    try:
        m = db.query(Model).filter(Model.slug == "peek-c").first()
        m.status = "deprecated"
        db.commit()
    finally:
        db.close()
    again = client.get(f"/api/v1/peek/demo/{slug}").json()
    assert again["models"] == [], f"退役实体仍出现在 peek 里：{again['models']}"


def test_peek_rejects_bad_kind_and_missing_entity(client):
    assert client.get("/api/v1/peek/thing/x").status_code == 422
    assert client.get("/api/v1/peek/model/no-such-model-xyz").status_code == 404
    assert client.get("/api/v1/peek/task/no-such-task-xyz").status_code == 404
    assert client.get("/api/v1/peek/demo/no-such-demo-xyz").status_code == 404
