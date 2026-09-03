"""v2 B3′：prompt 聚类建议 + 一键成题闭环。

档位语义（评审与重排.md §六，线上 235 条真实提示词标定）：
  exact   = 同一句提示词，≥2 作品即成立（不要求跨模型）
  similar = TF-IDF 余弦 ≥0.35，且 ≥3 作品 + ≥2 不同模型
所有请求都带 ?refresh=1 绕开 60s 缓存，避免用例间互相看到旧快照。
"""

from app.models import Demo, DemoModel, DemoTag, Model, Tag


def _seed(db, slug, prompt, model_name, title=None):
    """建 demo + 模型实体 + model 标签（双轨都写，聚类两轨都要读）。"""
    d = Demo(slug=slug, title=title or slug, description="聚类测试", prompt=prompt, status="approved", demo_type="web")
    db.add(d)
    db.flush()

    m = db.query(Model).filter(Model.name == model_name).first()
    if m is None:
        m = Model(slug=model_name, name=model_name, status="active")
        db.add(m)
        db.flush()
    if not db.query(DemoModel).filter(DemoModel.demo_id == d.id, DemoModel.model_id == m.id).first():
        db.add(DemoModel(demo_id=d.id, model_id=m.id))

    t = db.query(Tag).filter(Tag.key == "model", Tag.value == model_name).first()
    if t is None:
        t = Tag(key="model", value=model_name, description="")
        db.add(t)
        db.flush()
    if not db.query(DemoTag).filter(DemoTag.demo_id == d.id, DemoTag.tag_id == t.id).first():
        db.add(DemoTag(demo_id=d.id, tag_id=t.id))
    db.commit()


BASE = "请用 three.js 做一个可以在浏览器里直接打开的 3D 太阳系，行星按真实比例公转自转，鼠标拖动可以旋转视角，滚轮可以缩放，点击行星显示名称与参数。"


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _clusters(client, admin_headers, **params):
    q = {"refresh": "1", **params}
    r = client.get("/api/v1/admin/prompt-clusters", params=q, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_exact_cluster_groups_same_prompt(client, admin_headers):
    """同一句提示词、两个模型 → exact 档；第三方微改写句不入 exact。"""
    db = _db()
    _seed(db, "clu-ex-a", BASE, "CluModelA")
    _seed(db, "clu-ex-b", BASE, "CluModelB")
    _seed(db, "clu-ex-c", BASE.replace("公转自转", "公转和自转"), "CluModelC")
    db.close()

    data = _clusters(client, admin_headers)
    hits = [c for c in data["exact"] if {"clu-ex-a", "clu-ex-b"} <= {d["slug"] for d in c["demos"]}]
    assert hits, f"未找到精确同句簇：{data['stats']}"
    c = hits[0]
    assert {d["slug"] for d in c["demos"]} == {"clu-ex-a", "clu-ex-b"}
    assert c["demo_count"] == 2 and c["distinct_models"] == 2
    assert c["sample_prompt"].startswith("请用 three.js")
    assert c["suggested_title"]
    assert c["covered"] is False
    assert data["stats"]["exact_clusters"] >= 1


def test_similar_cluster_needs_size_and_models(client, admin_headers):
    """同题材各说一句（≥3 作品 + ≥2 模型）→ 落 similar，不出现在 exact。"""
    db = _db()
    _seed(db, "clu-sim-1", BASE + " 另外要有一个速度调节滑杆。", "SimA")
    _seed(db, "clu-sim-2", BASE + " 另外要有音效开关。", "SimB")
    _seed(db, "clu-sim-3", BASE + " 另外要有星空背景。", "SimC")
    _seed(db, "clu-sim-4", "请写一个完全无关的贪吃蛇网页游戏，键盘方向键控制，吃食物变长，撞墙判定失败并计分。", "SimD")
    db.close()

    data = _clusters(client, admin_headers)
    hits = [c for c in data["similar"] if {"clu-sim-1", "clu-sim-2", "clu-sim-3"} <= {d["slug"] for d in c["demos"]}]
    assert hits, f"相似簇未成形：{data['stats']}"
    c = hits[0]
    assert c["demo_count"] >= 3 and c["distinct_models"] >= 2
    assert c["score"] == 0.35
    slugs = {d["slug"] for d in c["demos"]}
    assert "clu-sim-4" not in slugs, "无关提示词被误聚进来了"
    assert all("clu-sim-1" not in {d["slug"] for d in e["demos"]} for e in data["exact"])


def test_adopt_cluster_creates_benchmark_and_marks_covered(client, admin_headers):
    """成题闭环：簇的 demo_ids → 一键建题 → Benchmark 对比行成立 → 同簇 covered=true。"""
    db = _db()
    _seed(db, "clu-ad-1", BASE + " 补充：需要行星轨道标签。", "AdA")
    _seed(db, "clu-ad-2", BASE + " 补充：需要轨迹残影。", "AdB")
    _seed(db, "clu-ad-3", BASE + " 补充：需要视角锁定。", "AdC")
    ids = {
        slug: did
        for did, slug in db.query(Demo.id, Demo.slug).filter(Demo.slug.like("clu-ad-%")).all()
    }
    db.close()
    assert len(ids) == 3
    want = set(ids.keys())  # slug 集合（ids 是 slug → demo_id 的映射）

    data = _clusters(client, admin_headers)
    target = next(
        (c for c in data["similar"] + data["exact"] if want <= {d["slug"] for d in c["demos"]}),
        None,
    )
    assert target, f"未拿到目标簇：{data['stats']}"
    demo_ids = sorted({d["demo_id"] for d in target["demos"] if d["slug"] in ids})
    assert len(demo_ids) == 3

    r = client.post(
        "/api/v1/admin/tasks",
        json={"title": "3D 太阳系（成题测试）", "demo_ids": demo_ids},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    task = r.json()
    assert task["attached"] == 3

    detail = client.get(f"/api/v1/tasks/{task['slug']}").json()
    assert detail["demos_total"] == 3
    assert len(detail["compare"]) >= 2, "Benchmark 对比行未成形（应每模型一行）"
    assert all(row["model"]["slug"] for row in detail["compare"])

    after = _clusters(client, admin_headers)
    merged = next(
        (c for c in after["similar"] + after["exact"] if want <= {d["slug"] for d in c["demos"]}),
        None,
    )
    assert merged and merged["covered"] is True, "成题后仍被当作未覆盖簇推荐（缓存/失效未生效）"


def test_cluster_threshold_is_tunable(client, admin_headers):
    """阈值可调（面板要继续观察时用），非法值由 Query 校验挡下。"""
    loose = _clusters(client, admin_headers, min_score=0.2, similar_min_models=1, similar_min_demos=2)
    strict = _clusters(client, admin_headers, min_score=0.6)
    assert loose["stats"]["similar_clusters"] >= strict["stats"]["similar_clusters"]
    assert client.get("/api/v1/admin/prompt-clusters", params={"min_score": 5}, headers=admin_headers).status_code == 422


def test_clusters_require_admin(client):
    # conftest 的 client 是 session 级：前序用例登录留下的 Cookie 会让 401 变 200，必须先清
    client.cookies.clear()
    assert client.get("/api/v1/admin/prompt-clusters").status_code == 401
    client.cookies.clear()
