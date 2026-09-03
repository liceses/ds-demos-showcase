"""Q2：模型必填 + 三档兜底（family / unknown / guess）+ 证据留痕 + 统计折叠。

不变式：
1. 强制 model 的前提是「不确定有正门」，所以 unspecified 与 <vendor>-unknown 必须是合法词表值；
2. 兜底位不能被当成型号排名 —— 热门榜必须折叠成「其他/未定 N」；
3. 校验一律发生在重活（下载/解压）之前，不留孤儿 demo。
"""

import os

from app.models import Demo, Model, Tag, TagKey


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, tags, hint=None):
    data = {"title": title, "description": "Q2 兜底测试", "demo_type": "web", "tags": tags}
    if hint:
        data["model_hint"] = hint
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    return client.post("/api/v1/demos", data=data, files=files)


def test_upload_without_model_is_rejected_with_a_way_out(client):
    r = _upload(client, "没有模型标签", '["type:game"]')
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "model:unspecified" in detail and "-unknown" in detail, f"错误文案没给出兜底出路: {detail}"


def test_unspecified_fallback_is_selectable_and_recorded(client):
    """unknown 档：完全不知道 —— 走兜底值，resolution 与 model_hint 都落库。"""
    from app.services import model_service

    db = _db()
    if db.get(TagKey, "model") is None:
        db.add(TagKey(key="model", mode="fixed", label="模型", description="", sort=1, tier=1))
        db.commit()
    model_service.ensure_fallback_models(db)
    db.close()

    r = _upload(client, "完全不知", '["model:unspecified", "type:game"]', hint="别人传的，没写模型")
    assert r.status_code == 201, r.text
    detail = client.get(f"/api/v1/demos/{r.json()['slug']}").json()
    assert detail["model_hint"] == "别人传的，没写模型"
    assert len(detail["models"]) == 1
    m = detail["models"][0]
    assert m["slug"] == "unspecified" and m["resolution"] == "unknown", m


def test_family_node_created_for_vendor_and_selectable(client, admin_headers):
    """family 档：登记带厂商的精确型号后，该厂商的「未定型号」节点自动可用。"""
    from app.services import model_service

    db = _db()
    model_service.ensure_fallback_models(db)
    db.close()

    r = client.post(
        "/api/v1/admin/models",
        json={"name": "Q2Vendor Model", "vendor": "Q2Vendor"},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text

    db = _db()
    fam = db.query(Model).filter(Model.slug == "q2vendor-unknown").first()
    assert fam is not None, "登记厂商后未自动建族节点"
    assert fam.resolution == "family" and fam.vendor == "Q2Vendor"
    tag = db.query(Tag).filter(Tag.key == "model", Tag.value == "q2vendor-unknown").first()
    assert tag is not None, "族节点没进 fixed 词表，上传会被 422 挡死"
    db.close()

    up = _upload(client, "知厂商不知型号", '["model:q2vendor-unknown", "type:game"]', hint="只知道是 Q2Vendor 家的")
    assert up.status_code == 201, up.text
    detail = client.get(f"/api/v1/demos/{up.json()['slug']}").json()
    assert detail["models"][0]["resolution"] == "family"


def test_guess_bucket_maps_ds_unknown_to_unverified(client):
    """guess 档：ds-unknown 归 unverified + resolution=guess（灰测揭晓的资产池）。"""
    up = _upload(client, "灰测归属", '["model:ds-unknown", "type:game"]')
    assert up.status_code == 201, up.text
    db = _db()
    m = db.query(Model).filter(Model.slug == "ds-unknown").first()
    assert m is not None
    assert m.resolution == "guess" and m.status == "unverified", (m.resolution, m.status)
    db.close()


def test_update_cannot_clear_model(client, admin_headers):
    up = _upload(client, "编辑清空测试", '["model:dsv4-flash", "type:game"]')
    assert up.status_code == 201, up.text
    slug = up.json()["slug"]
    files = {"file": ("index.html", b"<!doctype html><html><body>ok</body></html>", "text/html")}
    # 编辑需作者/管理员身份，否则 401 会掩盖真正的 422 断言
    r = client.put(f"/api/v1/demos/{slug}", data={"tags": '["type:game"]'}, files=files, headers=admin_headers)
    assert r.status_code == 422, r.text


def test_fallback_excluded_from_top_lists(client):
    """兜底位不参与热门模型榜，改由 fallback_demos 折叠呈现。"""
    from app.services import model_service

    db = _db()
    items, _total = model_service.list_models(db, exclude_fallback=True, page_size=100)
    assert all(m["resolution"] == "exact" for m in items), items[:3]
    names = {m["name"] for m in items}
    assert "ds-unknown" not in names and "unspecified" not in names
    assert model_service.fallback_demo_count(db) >= 1
    db.close()

    exp = client.get("/api/v1/explore").json()
    assert "ds-unknown" not in {m["name"] for m in exp["models"]["items"]}
    assert exp["models"]["fallback_demos"] >= 1


def test_cjk_titles_and_vendors_get_ascii_slugs(client):
    """URL 必须 ASCII：中文题面退化成 `task-N`，中文厂商名用确定性哈希（防撞、不改指）。"""
    from app.services import model_service, task_service

    db = _db()
    try:
        t1 = task_service.create_task(db, title="我的世界网页版复刻")
        assert t1.slug and t1.slug.isascii(), t1.slug
        assert t1.title == "我的世界网页版复刻"  # 展示仍是中文，只有 URL 是 ASCII

        t2 = task_service.create_task(db, title="纯中文题面第二道")
        assert t2.slug != t1.slug and t2.slug.isascii(), (t1.slug, t2.slug)

        # 中文厂商名：各自族 slug 互不相同（退化会互相改指向）
        a = model_service.ensure_family_for_vendor(db, "智谱")
        b = model_service.ensure_family_for_vendor(db, "月之暗面")
        assert a.slug != b.slug and a.slug.isascii() and b.slug.isascii(), (a.slug, b.slug)
        assert a.vendor == "智谱" and b.vendor == "月之暗面"  # 没被后来者改指
    finally:
        db.rollback()
        db.close()


def test_from_url_validates_model_before_download(client):
    """from-url 也先校验模型声明：用不可达 zip_url 证明没有先去下载。"""
    r = client.post(
        "/api/v1/demos/from-url",
        json={
            "title": "agent 无模型",
            "description": "缺 model 声明",
            "demo_type": "web",
            "zip_url": "http://127.0.0.1:1/nope.zip",
            "tags": ["type:game"],
        },
    )
    assert r.status_code == 422, r.text
    assert "模型" in r.json()["detail"]
    db = _db()
    assert db.query(Demo).filter(Demo.title == "agent 无模型").first() is None
    db.close()
