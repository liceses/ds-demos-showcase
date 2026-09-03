"""合并后的名字匹配必须跟随 merged_into 链。

修的是**静默数据丢失**：合并后源实体仍占着自己的 name，精确名匹配先命中退役实体
→ 序列化过滤 deprecated → 作品看起来"没有模型"；而别名表排在精确名之后，根本没机会生效。
"""

import os

from app.models import Demo, DemoModel, Model


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags):
    data = {"title": title, "description": "合并后匹配用例", "demo_type": "web", "tags": tags}
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _model_id(name):
    db = _db()
    try:
        m = db.query(Model).filter(Model.name == name).first()
        return m.id if m else None
    finally:
        db.close()


def _merged_pair(client, admin_headers):
    """确保存在「dsv4flash-alt 已合并进 dsv4-flash」这一对，返回两个 id（不依赖用例顺序）。"""
    target_id = _model_id("dsv4-flash")
    assert target_id, "种子里应有 dsv4-flash"
    db = _db()
    try:
        alt = db.query(Model).filter(Model.slug == "dsv4flash-alt").first()
        if alt is None:
            alt = Model(slug="dsv4flash-alt", name="dsv4flash-alt", vendor="DeepSeek", status="active", resolution="exact")
            db.add(alt)
            db.commit()
        alt_id, already = alt.id, alt.status == "deprecated"
    finally:
        db.close()
    if not already:
        r = client.post(
            f"/api/v1/admin/models/{alt_id}/merge",
            json={"target_id": target_id, "dry_run": False, "reason": "测试合并"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
    return {"alt": alt_id, "target": target_id}


def test_upload_with_merged_name_lands_on_target(client, admin_headers):
    pair = _merged_pair(client, admin_headers)
    # 现实中这个写法本来就是词表里的固定值（实体就是从标签值长出来的），
    # 这里显式补上，否则会被 fixed 键校验正确拒绝（那不是本用例要测的东西）
    from app.services import model_service

    db = _db()
    try:
        model_service.ensure_tag_value(db, "dsv4flash-alt")
        db.commit()
    finally:
        db.close()

    # 关键：合并后仍用旧写法上传，必须落到归宿实体，而不是退役实体
    slug = _upload(client, "合并后上传", '["model:dsv4flash-alt", "type:game"]')
    d = client.get(f"/api/v1/demos/{slug}").json()
    slugs = [x["slug"] for x in d["models"]]
    assert "dsv4-flash" in slugs, f"旧写法没落到归宿实体：{slugs}"
    assert "dsv4flash-alt" not in slugs, slugs

    db = _db()
    try:
        demo = db.query(Demo).filter(Demo.slug == slug).first()
        links = [l.model_id for l in db.query(DemoModel).filter(DemoModel.demo_id == demo.id).all()]
        assert links and all(lid != _model_id("dsv4flash-alt") for lid in links), "作品被挂到已退役实体上了"
    finally:
        db.close()


def test_match_follows_chain_for_normalized_variant(client, admin_headers):
    """大小写/分隔符变体也要跟链：精确名命中退役实体时不能就地返回。"""
    from app.services import matching_service

    pair = _merged_pair(client, admin_headers)
    db = _db()
    try:
        for raw in ("dsv4flash-alt", "DSV4FLASH-ALT", "dsv4flash alt"):
            got = matching_service.match_model(db, raw)
            assert got is not None and got.id == pair["target"], (raw, got and got.slug)
    finally:
        db.close()


def test_retired_but_unmerged_model_still_resolves(client):
    """只退役、没合并的实体：仍解析到它自己（不猜、不吞），避免误改归属。"""
    from app.services import matching_service

    db = _db()
    try:
        m = db.query(Model).filter(Model.slug == "retired-alone").first()
        if m is None:
            m = Model(slug="retired-alone", name="Retired Alone", status="deprecated", resolution="exact", merged_into_id=None)
            db.add(m)
            db.commit()
        got = matching_service.match_model(db, "Retired Alone")
        assert got is not None and got.id == m.id
    finally:
        db.close()


def test_alias_map_excludes_deprecated(client):
    """别名映射里不该出现退役实体（否则 setdefault 先到先得会把名字指回退役那个）。"""
    from app.services import matching_service

    db = _db()
    try:
        mapping = matching_service._alias_map(db)
        bad = []
        for key, mid in mapping.items():
            m = db.get(Model, mid)
            if m is None or m.status == "deprecated":
                bad.append((key, m and m.slug))
        assert not bad, bad[:5]
    finally:
        db.close()
