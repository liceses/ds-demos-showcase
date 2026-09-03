"""社区分算法（经验贝叶斯收缩）+ 模型页分页清单。

核心不变式（决策人验收标准）：
- 「1 件作品 / 1 票 / 5.0」的模型，score 必须**低于**「12 件 / 40 票 / 4.7」的模型；
- 零票 → score 为 None（没证据不等于 0 分）；
- 旧字段 rating_avg 语义不变（等权均分），score 才是排序与展示口径。
"""

from datetime import datetime, timedelta

from app.models import Demo, DemoModel, Model


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _mk_model(name):
    """直建 active+exact 实体（绕开懒建路径，让分数用例只依赖评分数据）。"""
    db = _db()
    try:
        m = db.query(Model).filter(Model.name == name).first()
        if m is None:
            m = Model(slug=name.lower().replace(" ", "-"), name=name, vendor=None, status="active", resolution="exact")
            db.add(m)
            db.flush()
            db.commit()
        return m.id
    finally:
        db.close()


def _mk_demos(model_id, count, rating_avg, rating_count, prefix):
    """给模型挂 count 件作品，每件 rating_count 票、均分 rating_avg。"""
    db = _db()
    try:
        stamp = datetime.utcnow()
        for i in range(count):
            d = Demo(
                slug=f"{prefix}-{i}",
                title=f"{prefix} 作品 {i}",
                description="分数算法用例",
                status="approved",
                demo_type="web",
                prompt="",
                rating_avg=rating_avg,
                rating_count=rating_count,
                rating_sum=int(rating_avg * rating_count),
                created_at=stamp - timedelta(hours=i),
                updated_at=stamp,
            )
            db.add(d)
            db.flush()
            db.add(DemoModel(demo_id=d.id, model_id=model_id))
        db.commit()
    finally:
        db.close()


def _score_of(name):
    from app.services import model_service

    db = _db()
    try:
        items, _ = model_service.list_models(db, q=name, sort="score", page_size=50)
        return next((m for m in items if m["name"] == name), None)
    finally:
        db.close()


def _seed_background(n_models=6, per_model=8, votes_each=12, avg=4.2):
    """铺背景语料，让全站先验 C 落在"普通水平"，收缩才有参照系。

    只有两个模型时 C 会被其中一个自己污染（两边都收缩到同一处），
    那是玩具库的假象而非算法问题 —— 所以排序类断言必须有背景。
    """
    for i in range(n_models):
        mid = _mk_model(f"Background {i}")
        _mk_demos(mid, per_model, avg, votes_each, f"bg{i}")


def test_low_sample_high_rating_loses_to_high_sample_solid_rating(client):
    """收缩生效的唯一判据：1 票 5.0 必须输给 40 票×12 件的 4.7。"""
    _seed_background()
    thin = _mk_model("Thin Five")
    solid = _mk_model("Solid Forty")
    _mk_demos(thin, 1, 5.0, 1, "thin")
    _mk_demos(solid, 12, 4.7, 40, "solid")

    a = _score_of("Thin Five")
    b = _score_of("Solid Forty")
    assert a and b
    # 等权均分旧口径会把 5.0 排在前面 —— 这正是要修的缺陷
    assert a["rating_avg"] > b["rating_avg"], (a["rating_avg"], b["rating_avg"])
    assert a["score"] < b["score"], (a["score"], b["score"])
    assert a["sample_level"] == "low" and b["sample_level"] == "high", (a["sample_level"], b["sample_level"])


def test_zero_votes_has_no_score_not_zero(client):
    m = _mk_model("No Votes")
    _mk_demos(m, 2, 0.0, 0, "novote")
    row = _score_of("No Votes")
    assert row["score"] is None, row
    assert row["votes"] == 0 and row["sample_level"] == "none", row


def test_shrink_formula_is_closed_form_and_exposed(client):
    """score = (wsum + m·C) / (v + m)：详情要把先验一起给出，读者能自己验算。"""
    from app.services import model_service

    m = _mk_model("Checkable")
    _mk_demos(m, 3, 4.0, 20, "chk")
    db = _db()
    try:
        C, mu = model_service.score_prior(db)
        detail = model_service.model_detail(db, m)
    finally:
        db.close()
    expected = round((4.0 * 60 + mu * C) / (60 + mu), 2)
    assert detail["score"] == expected, (detail["score"], expected, C, mu)
    assert detail["prior"] == {"C": C, "m": mu}


def test_sort_by_score_orders_by_shrunk_value(client):
    from app.services import model_service

    db = _db()
    try:
        items, _ = model_service.list_models(db, sort="score", page_size=100)
    finally:
        db.close()
    scored = [m for m in items if m["score"] is not None]
    assert scored == sorted(scored, key=lambda x: (-x["score"], -x["votes"])), [m["score"] for m in scored]


def test_model_demos_endpoint_paginates_and_sorts(client):
    """模型页看全：分页 + 排序 + facet（旧实现只有硬编码 12 件）。"""
    m = _mk_model("Many Demos")
    _mk_demos(m, 30, 3.0, 5, "many")

    r = client.get("/api/v1/models/many-demos/demos?page_size=12")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 30, body["total"]
    assert len(body["items"]) == 12

    r2 = client.get("/api/v1/models/many-demos/demos?page=2&page_size=12")
    p1 = {x["slug"] for x in body["items"]}
    p2 = {x["slug"] for x in r2.json()["items"]}
    assert not (p1 & p2), "分页重叠"
    assert len(p1 | p2) == 24

    # 别名/slug 之外的旧写法仍能解析（详情与分页共用同一解析入口）
    assert client.get("/api/v1/models/many-demos/demos?sort=popular").status_code == 200
    assert client.get("/api/v1/models/many-demos/demos?sort=nonsense").status_code == 422
    assert client.get("/api/v1/models/no-such-model/demos").status_code == 404


def test_model_brief_in_lists_carries_score_fields(client):
    r = client.get("/api/v1/models?sort=score&page_size=5")
    assert r.status_code == 200, r.text
    for m in r.json()["items"]:
        assert "score" in m and "votes" in m and "sample_level" in m, m
