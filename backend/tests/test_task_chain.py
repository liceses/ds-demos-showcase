"""题目链条视图（方案 A）：`GET /tasks/{slug}` 的 `chain` 载荷。

锁住三件有语义的事：
1. 题面来源必须诚实（作者写的 description 优先，否则回落到基准提示词并标注）；
2. **一致性未知 ≠ 一致**（未填提示词的作品不能算符合基准）；
3. 基准提示词取"出现最多的 prompt_id"，退役模型不进链条。
"""

import os

from app.models import Demo, DemoTask, Model, Prompt, Task


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _ensure_value(value: str) -> None:
    """`model:` 是固定键，值必须先在词表里（422 是正确行为）。"""
    from app.services import model_service

    db = _db()
    try:
        model_service.ensure_tag_value(db, value)
        db.commit()
    finally:
        db.close()


def _mk_demo(client, title, prompt_text, model_name):
    _ensure_value(model_name)
    data = {
        "title": title,
        "description": "链条用例",
        "demo_type": "web",
        "tags": f'["model:{model_name}", "type:game"]',
        "prompt": prompt_text,
    }
    files = {"file": ("index.html", f"<!doctype html><html><body>{os.urandom(6).hex()}</body></html>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _approved(slug):
    db = _db()
    try:
        d = db.query(Demo).filter(Demo.slug == slug).first()
        d.status = "approved"
        db.commit()
        return d.id
    finally:
        db.close()


def test_chain_prefers_author_brief_and_marks_source(client):
    db = _db()
    try:
        t = Task(slug="chain-brief-a", title="链条题面 A", description="作者自己写的题面", status="active")
        db.add(t)
        db.commit()
        tid = t.id
    finally:
        db.close()
    s1 = _approved(_mk_demo(client, "链条作品一", "做一个塔防游戏", "chain-m1"))
    db = _db()
    try:
        db.add(DemoTask(task_id=tid, demo_id=s1))
        db.commit()
    finally:
        db.close()

    chain = client.get("/api/v1/tasks/chain-brief-a").json()["chain"]
    assert chain["brief"] == "作者自己写的题面", chain
    assert chain["brief_source"] == "description", chain
    assert len(chain["rows"]) == 1


def test_chain_falls_back_to_prompt_and_counts_variants(client):
    db = _db()
    try:
        t = Task(slug="chain-brief-b", title="链条题面 B", description="", status="active")
        db.add(t)
        db.commit()
        tid = t.id
    finally:
        db.close()
    # 两件用同一句（成为基准），一件用另一句（不同题面），一件没填
    a = _approved(_mk_demo(client, "链条同句一", "做一个 3D 星系模拟器，可缩放", "chain-m2"))
    b = _approved(_mk_demo(client, "链条同句二", "做一个 3D 星系模拟器，可缩放", "chain-m3"))
    c = _approved(_mk_demo(client, "链条异句", "做一个完全不同的像素画板", "chain-m4"))
    d = _approved(_mk_demo(client, "链条无句", "", "chain-m5"))
    db = _db()
    try:
        for i in (a, b, c, d):
            db.add(DemoTask(task_id=tid, demo_id=i))
        db.commit()
    finally:
        db.close()

    detail = client.get("/api/v1/tasks/chain-brief-b").json()
    chain = detail["chain"]
    assert chain["brief_source"] == "prompt", chain
    assert "星系模拟器" in chain["brief"], chain["brief"]
    by = {r["slug"]: r for r in chain["rows"]}
    assert by[_slug(a)]["same_prompt"] is True, by
    assert by[_slug(b)]["same_prompt"] is True, by
    assert by[_slug(c)]["same_prompt"] is False, "不同提示词必须标为不一致"
    # 关键：未填提示词是"未知"，不能算一致也不能算不一致
    assert by[_slug(d)]["same_prompt"] is None, by
    assert chain["prompt_variants"] == 2, chain
    assert chain["no_prompt_count"] == 1, chain


def _slug(demo_id):
    db = _db()
    try:
        return db.query(Demo.slug).filter(Demo.id == demo_id).scalar()
    finally:
        db.close()


def test_chain_excludes_deprecated_models(client):
    db = _db()
    try:
        t = Task(slug="chain-dep", title="链条退役", description="x", status="active")
        db.add(t)
        db.commit()
        tid = t.id
    finally:
        db.close()
    s = _approved(_mk_demo(client, "链条退役作品", "做一个迷宫游戏", "chain-m9"))
    db = _db()
    try:
        db.add(DemoTask(task_id=tid, demo_id=s))
        db.commit()
        m = db.query(Model).filter(Model.slug == "chain-m9").first()
        m.status = "deprecated"
        db.commit()
    finally:
        db.close()
    chain = client.get("/api/v1/tasks/chain-dep").json()["chain"]
    assert chain["rows"][0]["models"] == [], f"退役模型仍出现在链条里：{chain['rows'][0]}"
