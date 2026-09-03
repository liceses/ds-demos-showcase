"""v2 B1：模型/题目实体、双写同步、过滤语义（键间 AND 键内 OR）、tier 透出。"""


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def test_models_list_and_detail(client):
    from app.models import Demo, DemoModel, Model

    db = _db()
    m = Model(slug="testflash", name="TestFlash", vendor="TestV", status="active")
    db.add(m)
    db.flush()
    d1 = Demo(slug="m2d1", title="作品A", status="approved")
    d2 = Demo(slug="m2d2", title="作品B", status="approved", rating_avg=4.5, rating_count=2)
    db.add_all([d1, d2])
    db.flush()
    db.add_all([
        DemoModel(demo_id=d1.id, model_id=m.id),
        DemoModel(demo_id=d2.id, model_id=m.id),
    ])
    db.commit()
    db.close()

    r = client.get("/api/v1/models")
    assert r.status_code == 200, r.text
    data = r.json()
    item = next(x for x in data["items"] if x["slug"] == "testflash")
    assert item["demo_count"] == 2
    assert item["rating_avg"] == 4.5
    assert item["vendor"] == "TestV"

    r = client.get("/api/v1/models/testflash")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["demo_count"] == 2
    assert {d["slug"] for d in detail["recent_demos"]} == {"m2d1", "m2d2"}
    # 序列化携带实体数组（v2 字段）
    assert all(d.get("models") is not None and d.get("tasks") is not None for d in detail["recent_demos"])
    assert detail["recent_demos"][0]["models"][0]["slug"] == "testflash"


def test_tag_filter_or_within_key_and_across_keys(client):
    from app.models import Demo, DemoModel, DemoTag, Model, Tag

    db = _db()
    tag_orx = Tag(key="model", value="orx")
    tag_ory = Tag(key="model", value="ory")
    tag_game = Tag(key="game", value="mctest")
    db.add_all([tag_orx, tag_ory, tag_game])
    db.flush()

    m = Model(slug="orx", name="orx", status="active")
    db.add(m)
    db.flush()
    da = Demo(slug="orda", title="A", status="approved")
    dbb = Demo(slug="ordb", title="B", status="approved")
    dc = Demo(slug="ordc", title="C", status="approved")
    db.add_all([da, dbb, dc])
    db.flush()
    db.add_all([
        DemoTag(demo_id=da.id, tag_id=tag_orx.id),
        DemoTag(demo_id=dbb.id, tag_id=tag_ory.id),
        DemoTag(demo_id=dc.id, tag_id=tag_orx.id),
        DemoTag(demo_id=dc.id, tag_id=tag_game.id),
        DemoModel(demo_id=da.id, model_id=m.id),
        DemoModel(demo_id=dc.id, model_id=m.id),
    ])
    db.commit()
    db.close()

    # 键内 OR：model:orx 或 model:ory → A/B/C
    r = client.get("/api/v1/demos", params={"tag": ["model:orx", "model:ory"]})
    slugs = {d["slug"] for d in r.json()["items"]}
    assert slugs == {"orda", "ordb", "ordc"}

    # 键间 AND：model:orx 且 game:mctest → 仅 C
    r = client.get("/api/v1/demos", params={"tag": ["model:orx", "game:mctest"]})
    slugs = {d["slug"] for d in r.json()["items"]}
    assert slugs == {"ordc"}

    # 实体过滤 ?model=orx → A/C（demo_models 双写查询）
    r = client.get("/api/v1/demos", params={"model": "orx"})
    slugs = {d["slug"] for d in r.json()["items"]}
    assert slugs == {"orda", "ordc"}
    # 返回项里的 models 数组与实体过滤一致
    assert all(any(mm["slug"] == "orx" for mm in d["models"]) for d in r.json()["items"])


def test_task_detail_compare(client):
    from app.models import Demo, DemoModel, DemoTask, Model, Task

    db = _db()
    task = Task(slug="chess-game", title="在线国际象棋", status="active", description="做一个可玩的网页象棋")
    ma = Model(slug="cma", name="ModelA", status="active")
    mb = Model(slug="cmb", name="ModelB", status="active")
    db.add_all([task, ma, mb])
    db.flush()
    da = Demo(slug="chessa", title="棋A", status="approved", rating_avg=4.8, rating_count=5)
    dbb = Demo(slug="chessb", title="棋B", status="approved", rating_avg=4.2, rating_count=3)
    db.add_all([da, dbb])
    db.flush()
    db.add_all([
        DemoTask(demo_id=da.id, task_id=task.id),
        DemoTask(demo_id=dbb.id, task_id=task.id),
        DemoModel(demo_id=da.id, model_id=ma.id),
        DemoModel(demo_id=dbb.id, model_id=mb.id),
    ])
    db.commit()
    db.close()

    r = client.get("/api/v1/tasks")
    assert r.status_code == 200, r.text
    assert any(t["slug"] == "chess-game" for t in r.json()["items"])

    r = client.get("/api/v1/tasks/chess-game")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["demos_total"] == 2
    assert len(detail["compare"]) == 2
    # 对比行按平均分降序，ModelA(4.8) 在前
    assert detail["compare"][0]["model"]["slug"] == "cma"
    assert detail["compare"][0]["avg_rating"] == 4.8
    assert detail["compare"][0]["best_demo"]["slug"] == "chessa"
    # 详情附作品列表（已序列化）
    assert {d["slug"] for d in detail["demos"]} == {"chessa", "chessb"}


def test_task_suggest_rule_based(client):
    from app.models import Task

    db = _db()
    db.add(Task(slug="tetris-web", title="俄罗斯方块网页游戏", status="active"))
    db.commit()
    db.close()

    r = client.get("/api/v1/tasks/suggest", params={"q": "帮我做一个可以玩的俄罗斯方块网页游戏"})
    assert r.status_code == 200, r.text
    items = r.json()
    assert items and items[0]["score"] > 0
    tid = items[0]["task_id"]
    assert tid == client.get("/api/v1/tasks").json()["items"][0]["id"] or tid > 0


def test_upload_dual_write_models_and_prompt(client):
    """上传链路双写：model 标签 → demo_models + 自动建实体；prompt → prompts 去重。

    model 键是 fixed 模式，上传只能选已有固定值（dsv4-flash 在 init_db 种子里）。
    """
    files = {"file": ("index.html", b"<!doctype html><html><body>hi</body></html>", "text/html")}
    r = client.post(
        "/api/v1/demos",
        data={
            "title": "双写测试",
            "description": "v2 双写",
            "demo_type": "web",
            "prompt": "做一个测试页面",
            "tags": '["model:dsv4-flash", "type:demo"]',
        },
        files=files,
    )
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]

    detail = client.get(f"/api/v1/demos/{slug}").json()
    assert any(m["name"] == "dsv4-flash" for m in detail["models"])

    from app.models import Prompt

    db = _db()
    prompts_n = db.query(Prompt).count()
    db.close()
    assert prompts_n >= 1

    # 幂等键重复上传同 prompt → prompts 不重复增长
    files2 = {"file": ("index.html", b"<!doctype html><html><body>hi2</body></html>", "text/html")}
    r2 = client.post(
        "/api/v1/demos",
        data={"title": "双写测试2", "description": "v2", "demo_type": "web", "prompt": "做一个测试页面",
              "tags": '["model:dsv4-flash"]'},
        files=files2,
    )
    assert r2.status_code == 201
    db = _db()
    assert db.query(Prompt).count() == prompts_n
    db.close()


def test_slug_keeps_separators_and_unverified_normalization(client):
    """仿真 637 条线上数据抓出的两条回归锁：

    1. slug 必须保留连字符 —— 否则 `ds-unknown` 变 `dsunknown`，人与 agent 按模型名
       拼 URL 必然 404（normalize 只该用于匹配，不该外溢到对外标识）。
    2. 灰测判定两侧都要规范化 —— normalize('ds-unknown') = 'dsunknown'，
       拿原始写法比集合会让 396 个灰测作品全部丢掉 unverified 归属。
    """
    from app.services import model_service

    db = _db()
    try:
        m1, created1 = model_service.get_or_create_model(db, "Some-New-Model")
        assert created1 and m1.slug == "some-new-model", m1.slug

        m2, created2 = model_service.get_or_create_model(db, "ds-unknown")
        assert created2
        assert m2.status == "unverified", "灰测名未落到 unverified"
        assert m2.slug == "ds-unknown", m2.slug

        # 再取一次必须复用（不重复建、不重复改状态）——同时锁住别名缓存及时失效
        m3, created3 = model_service.get_or_create_model(db, "DS-Unknown")
        assert created3 is False and m3.id == m2.id, "等价写法在缓存 TTL 内重复建实体"
    finally:
        # 断言失败也必须归还连接：否则未提交的写事务会毒化后续用例（database is locked）
        db.rollback()
        db.close()


def test_tag_keys_expose_tier(client):
    r = client.get("/api/v1/tags/tag-keys")
    keys = {k["key"]: k for k in r.json()}
    assert keys["model"]["tier"] == 1
    assert keys["type"]["tier"] == 2
    assert keys["rounds"]["tier"] == 3
