"""v2 B5′：run 元数据收编（列派生 + 双读兼容 + Benchmark 三指标）。

关键不变式：
- 标签仍是写入面：`?tag=rounds:3-10` 是已发布 agent 契约，**不得因为收编列而静默失效**
- 新列参数 `?rounds=/minutes=/platform=` 走列，比 CAST 字符串更准
- 非数字脏值（time 键历史语义不明）静默忽略，不炸上传
- 对比行的轮数/耗时用 AVG 且忽略未填（None 而不是 0 冒充数据）
"""

import os

from app.models import Demo, TagKey


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _ensure_run_keys():
    """time/platform 不在种子键里（线上由管理员后加），测试按同一路径补齐。"""
    db = _db()
    for key, mode, label in (("time", "int", "耗时"), ("platform", "open", "平台")):
        if db.get(TagKey, key) is None:
            db.add(TagKey(key=key, mode=mode, label=label, description="", sort=9))
    db.commit()
    db.close()


def _upload(client, title, tags):
    data = {
        "title": title,
        "description": "run 元数据测试",
        "demo_type": "web",
        "tags": str(tags).replace("'", '"'),
    }
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _columns(slug):
    db = _db()
    d = db.query(Demo).filter(Demo.slug == slug).first()
    out = (d.gen_rounds, d.gen_minutes, d.gen_platform)
    db.close()
    return out


def test_run_meta_columns_derived_from_tags(client):
    """上传带 rounds/time/platform 标签 → 三个列被派生出来。"""
    _ensure_run_keys()
    slug = _upload(client, "元数据派生", ["model:dsv4-flash", "type:game", "rounds:4", "time:90", "platform:DSH"])
    assert _columns(slug) == (4, 90, "DSH")


def test_dirty_run_values_are_ignored_not_fatal():
    """列派生层要容忍脏值（int 键在上传层已挡非数字，这里测 service 自身的兜底）。"""
    from app.database import SessionLocal
    from app.models import Demo, DemoTag, Tag
    from app.services import model_service

    db = SessionLocal()
    t_bad = Tag(key="time", value="abc", description="")
    t_rounds = Tag(key="rounds", value="2.7", description="")
    db.add_all([t_bad, t_rounds])
    db.flush()
    d = Demo(slug="rm-dirty", title="脏值", description="", status="approved", prompt="")
    db.add(d)
    db.flush()
    db.add_all([DemoTag(demo_id=d.id, tag_id=t_bad.id), DemoTag(demo_id=d.id, tag_id=t_rounds.id)])
    db.flush()

    model_service.sync_run_meta(d)
    # 非整数字符串不炸、不写脏值；浮点字符串按 int 截断接受
    assert d.gen_minutes is None
    assert d.gen_rounds == 2
    db.rollback()
    db.close()


def test_both_query_paths_filter_consistently(client):
    """老 `tag=rounds:3-10` 与新 `?rounds=3-10` 必须同时命中（双读兼容）。"""
    _ensure_run_keys()
    hit = _upload(client, "轮数在区间内", ["model:dsv4-flash", "type:game", "rounds:5", "platform:DSH"])
    miss = _upload(client, "轮数超区间", ["model:dsv4-flash", "type:game", "rounds:50"])

    for params in ({"tag": "rounds:3-10"}, {"rounds": "3-10"}):
        slugs = {d["slug"] for d in client.get("/api/v1/demos", params=params).json()["items"]}
        assert hit in slugs, f"{params} 未命中"
        assert miss not in slugs, f"{params} 误命中"

    # 单值与单边区间语法
    assert hit in {d["slug"] for d in client.get("/api/v1/demos", params={"rounds": "5"}).json()["items"]}
    assert hit in {d["slug"] for d in client.get("/api/v1/demos", params={"rounds": "-10"}).json()["items"]}
    assert hit in {d["slug"] for d in client.get("/api/v1/demos", params={"rounds": "3-"}).json()["items"]}
    # 平台精确匹配（大小写不敏感）
    assert hit in {d["slug"] for d in client.get("/api/v1/demos", params={"platform": "dsh"}).json()["items"]}


def test_compare_rows_carry_three_metrics(client, admin_headers):
    """题目对比行：社区分 + 平均轮数 + 平均耗时（收编的收益兑现点）。

    注：上传时 sync_demo_models 已把 model 标签落成实体并挂好 demo_models，
    测试只需补 demo_tasks，不得再插 DemoModel（撞唯一约束）。
    """
    from app.models import Demo as D, DemoTask, Task

    _ensure_run_keys()
    s1 = _upload(client, "一轮直出", ["model:dsv4-flash", "type:game", "rounds:1", "time:15"])
    s2 = _upload(client, "多轮打磨", ["model:dsv4-pro", "type:game", "rounds:7", "time:180"])

    db = _db()
    t = Task(slug=f"rm-{os.urandom(3).hex()}", title="跑个 3D 游戏", status="active")
    db.add(t)
    db.flush()
    for slug in (s1, s2):
        d = db.query(D).filter(D.slug == slug).first()
        db.add(DemoTask(demo_id=d.id, task_id=t.id))
    tslug = t.slug
    db.commit()
    db.close()

    detail = client.get(f"/api/v1/tasks/{tslug}").json()
    rows = {r["model"]["name"]: r for r in detail["compare"]}
    assert set(["dsv4-flash", "dsv4-pro"]) <= set(rows)
    assert rows["dsv4-flash"]["avg_rounds"] == 1.0
    assert rows["dsv4-flash"]["avg_minutes"] == 15
    assert rows["dsv4-pro"]["avg_rounds"] == 7.0
    assert rows["dsv4-pro"]["avg_minutes"] == 180


def test_compare_metrics_none_when_unfilled(client, admin_headers):
    """未填轮数的作品：对比行该指标为 None（不用 0 冒充数据）。"""
    from app.models import Demo as D, DemoTask, Task

    _ensure_run_keys()
    slug = _upload(client, "没填轮数", ["model:dsv4-pro", "type:game"])
    db = _db()
    t = Task(slug=f"nm-{os.urandom(3).hex()}", title="无元数据题", status="active")
    db.add(t)
    db.flush()
    d = db.query(D).filter(D.slug == slug).first()
    db.add(DemoTask(demo_id=d.id, task_id=t.id))
    tslug = t.slug
    db.commit()
    db.close()

    row = client.get(f"/api/v1/tasks/{tslug}").json()["compare"][0]
    assert row["avg_rounds"] is None and row["avg_minutes"] is None
