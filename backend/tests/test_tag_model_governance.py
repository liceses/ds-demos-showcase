"""标签/模型治理修复回归（KB-1..KB-8）。

每条用例都对应一个实测过的缺陷，docstring 写明「修之前会怎样」，防止再退化。
"""

import json

from app.models import AuditLog, Demo, Model, Tag


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, headers, title, tags, hint="治理回归"):
    files = {"file": ("index.html", f"<!doctype html><body>{title}</body>".encode(), "text/html")}
    return client.post(
        "/api/v1/demos",
        headers=headers,
        data={
            "title": title,
            "description": "kb 回归",
            "demo_type": "web",
            "tags": json.dumps(tags),
            "model_hint": hint,
        },
        files=files,
    )


def _model_values(client) -> dict:
    keys = client.get("/api/v1/tags/tag-keys").json()
    return {v["value"]: v for v in next(k for k in keys if k["key"] == "model")["values"]}


def _new_model_value(client, admin_headers, value: str) -> None:
    r = client.post(
        "/api/v1/tags", headers=admin_headers, json={"key": "model", "value": value, "description": ""}
    )
    assert r.status_code == 201, r.text


def _audit_count(action: str | None = None) -> int:
    db = _db()
    try:
        q = db.query(AuditLog).filter(AuditLog.entity_type == "tag")
        if action:
            q = q.filter(AuditLog.action == action)
        return q.count()
    finally:
        db.close()


# ---------------- KB-1：标签合并真迁移 ----------------


def test_tag_merge_migrates_single_value_demo(client, admin_headers):
    """只挂源值的作品，合并后标签必须变成目标值。

    修之前：接口报 merged=1，作品的标签却被 delete-orphan 级联删掉（实测 tags=[]）。
    """
    for v in ("kb1-src", "kb1-dst"):
        _new_model_value(client, admin_headers, v)
    up = _upload(client, admin_headers, "KB1 单值作品", ["model:kb1-src", "type:game"])
    assert up.status_code == 201, up.text
    slug = up.json()["slug"]

    preview = client.post(
        "/api/v1/tags/admin/merge",
        headers=admin_headers,
        json={"from_key": "model", "from_value": "kb1-src", "to_key": "model", "to_value": "kb1-dst", "dry_run": True},
    ).json()
    assert preview["found"] is True and preview["merged"] == 1 and preview["affected_demos"] == 1, preview

    res = client.post(
        "/api/v1/tags/admin/merge",
        headers=admin_headers,
        json={"from_key": "model", "from_value": "kb1-src", "to_key": "model", "to_value": "kb1-dst", "dry_run": False},
    ).json()
    assert res["merged"] == 1 and res["deleted_source"] is True, res

    detail = client.get(f"/api/v1/demos/{slug}").json()
    model_tags = [t["value"] for t in detail["tags"] if t["key"] == "model"]
    assert model_tags == ["kb1-dst"], model_tags
    values = _model_values(client)
    assert "kb1-src" not in values
    assert values["kb1-dst"]["demo_count"] >= 1


def test_tag_merge_reports_missing_source_instead_of_fake_success(client, admin_headers):
    """源值不存在时如实回报 found=false，不再用一串 0 假装合并成功。"""
    _new_model_value(client, admin_headers, "kb1b-dst")
    res = client.post(
        "/api/v1/tags/admin/merge",
        headers=admin_headers,
        json={"from_key": "model", "from_value": "kb1b-nope", "to_key": "model", "to_value": "kb1b-dst", "dry_run": False},
    ).json()
    assert res["found"] is False and res["merged"] == 0, res


def test_tag_merge_backfills_model_link_and_run_meta(client, admin_headers):
    """合并 model/rounds 之后要回填 demo_models 与 gen_rounds，不能只改标签。"""
    for v in ("kb2-src", "kb2-dst"):
        _new_model_value(client, admin_headers, v)
    a = _upload(client, admin_headers, "KB2 轮数源", ["model:kb2-src", "rounds:5", "type:game"])
    b = _upload(client, admin_headers, "KB2 轮数目标", ["model:kb2-dst", "rounds:7", "type:game"])
    assert a.status_code == 201 and b.status_code == 201, (a.text, b.text)
    slug_a = a.json()["slug"]

    for body in (
        {"from_key": "rounds", "from_value": "5", "to_key": "rounds", "to_value": "7", "dry_run": False},
        {"from_key": "model", "from_value": "kb2-src", "to_key": "model", "to_value": "kb2-dst", "dry_run": False},
    ):
        r = client.post("/api/v1/tags/admin/merge", headers=admin_headers, json=body)
        assert r.status_code == 200, r.text

    detail = client.get(f"/api/v1/demos/{slug_a}").json()
    assert [t["value"] for t in detail["tags"] if t["key"] == "rounds"] == ["7"]
    assert [m["name"] for m in detail["models"]] == ["kb2-dst"], detail["models"]
    db = _db()
    try:
        demo = db.query(Demo).filter(Demo.slug == slug_a).first()
        assert demo.gen_rounds == 7, demo.gen_rounds
    finally:
        db.close()


# ---------------- KB-4：标签写路径全留痕 ----------------


def test_tag_merge_writes_audit(client, admin_headers):
    """合并必须落一条 merge 审计（before/after 带迁移计数与受影响作品）。"""
    for v in ("kb3-src", "kb3-dst"):
        _new_model_value(client, admin_headers, v)
    before = _audit_count("merge")
    r = client.post(
        "/api/v1/tags/admin/merge",
        headers=admin_headers,
        json={"from_key": "model", "from_value": "kb3-src", "to_key": "model", "to_value": "kb3-dst", "dry_run": False},
    )
    assert r.status_code == 200, r.text
    db = _db()
    try:
        row = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "tag", AuditLog.action == "merge")
            .order_by(AuditLog.id.desc())
            .first()
        )
    finally:
        db.close()
    assert _audit_count("merge") == before + 1
    assert row is not None and row.before and row.after
    assert "merged_into" in (row.after or "")


def test_tag_admin_writes_are_audited(client, admin_headers):
    """标签键/值/分组的全部写操作都要留痕。

    修之前：合并、分组改清、键值增删一律不写 audit_log（实测计数不变）。
    """
    before = _audit_count()
    key = "kb7key"
    assert client.post(
        "/api/v1/tags/admin/tag-keys",
        headers=admin_headers,
        json={"key": key, "mode": "fixed", "label": "回归键", "sort": 90},
    ).status_code == 201
    assert client.post(
        "/api/v1/tags", headers=admin_headers, json={"key": key, "value": "v1", "description": "", "group": "G"}
    ).status_code == 201
    tag_id = client.get(f"/api/v1/tags/{key}:v1").json()["id"]
    assert client.put(
        f"/api/v1/tags/admin/values/{tag_id}/group", headers=admin_headers, json={"group": "H"}
    ).status_code == 200
    assert client.put(
        f"/api/v1/tags/admin/groups/{key}/H", headers=admin_headers, json={"new_group": "I"}
    ).status_code == 200
    assert client.delete(f"/api/v1/tags/admin/groups/{key}/I", headers=admin_headers).status_code == 200
    assert client.delete(f"/api/v1/tags/admin/tag-keys/{key}/values/v1", headers=admin_headers).status_code == 204
    assert client.delete(f"/api/v1/tags/admin/tag-keys/{key}", headers=admin_headers).status_code == 204

    assert _audit_count() == before + 7, "标签域写操作没有逐条留痕"


# ---------------- KB-3：退役值只拦写、不误伤存量 ----------------


def test_deprecated_value_blocked_for_new_but_allowed_on_edit(client, admin_headers):
    """退役值不能再被新选；作品已挂的存量值编辑时放行。

    修之前：`_resolve_tag` 不看 status，退役值照样能被挂上（实测上传 201）。
    """
    _new_model_value(client, admin_headers, "kb4-retired")
    up = _upload(client, admin_headers, "KB4 存量作品", ["model:kb4-retired", "type:game"])
    assert up.status_code == 201, up.text
    slug = up.json()["slug"]
    tag_id = client.get("/api/v1/tags/model:kb4-retired").json()["id"]
    assert client.put(
        f"/api/v1/admin/entities/tag/{tag_id}/status",
        headers=admin_headers,
        json={"status": "deprecated", "reason": "回归：退役"},
    ).status_code == 200

    # 新上传：422
    r = _upload(client, admin_headers, "KB4 新作品", ["model:kb4-retired", "type:game"])
    assert r.status_code == 422, r.text

    # 存量作品原样编辑：204（不能把退役成本转嫁给作者）
    r = client.put(
        f"/api/v1/demos/{slug}",
        headers=admin_headers,
        data={"tags": json.dumps(["model:kb4-retired", "type:game"]), "description": "改个描述"},
    )
    assert r.status_code == 204, r.text

    # 给别的作品新挂退役值：422
    other = _upload(client, admin_headers, "KB4 其它作品", ["model:dsv4-flash", "type:game"])
    assert other.status_code == 201, other.text
    r = client.put(
        f"/api/v1/demos/{other.json()['slug']}",
        headers=admin_headers,
        data={"tags": json.dumps(["model:dsv4-flash", "model:kb4-retired", "type:game"])},
    )
    assert r.status_code == 422, r.text


# ---------------- KB-2：标签与模型实体双向一致 ----------------


def test_create_model_syncs_tag_value(client, admin_headers):
    """管理端新建型号必须同时进词表，否则作者永远选不到（修前上传 422）。"""
    r = client.post(
        "/api/v1/admin/models",
        headers=admin_headers,
        json={"name": "kb5-new-model", "vendor": "KBVendor", "status": "active"},
    )
    assert r.status_code == 201, r.text
    assert "kb5-new-model" in _model_values(client)

    up = _upload(client, admin_headers, "KB5 新模型作品", ["model:kb5-new-model", "type:game"])
    assert up.status_code == 201, up.text


def test_merge_model_deprecates_source_tag_value(client, admin_headers):
    """实体合并后，词表里的旧值要退役（修前仍是 active，选择器可选到已合并型号）。"""
    for name in ("kb6-src", "kb6-dst"):
        assert client.post(
            "/api/v1/admin/models", headers=admin_headers, json={"name": name, "status": "active"}
        ).status_code == 201
    db = _db()
    try:
        dst_id = db.query(Model.id).filter(Model.name == "kb6-dst").scalar()
    finally:
        db.close()
    r = client.post(
        f"/api/v1/admin/models/kb6-src/merge",
        headers=admin_headers,
        json={"target_id": dst_id, "dry_run": False},
    )
    assert r.status_code == 200, r.text
    assert "kb6-src" not in _model_values(client)  # 公开词表已过滤退役值
    admin_keys = client.get("/api/v1/tags/admin/tag-keys", headers=admin_headers).json()
    vals = {v["value"]: v["status"] for v in next(k for k in admin_keys if k["key"] == "model")["values"]}
    assert vals.get("kb6-src") == "deprecated", vals.get("kb6-src")


# ---------------- KB-5：标签删除的完整性闸 ----------------


def test_cross_key_parent_is_rejected(client, admin_headers):
    """父标签必须同 key（修前允许跨 key，成为删键 500 的触发条件）。"""
    for key in ("kb8a", "kb8b"):
        assert client.post(
            "/api/v1/tags/admin/tag-keys",
            headers=admin_headers,
            json={"key": key, "mode": "fixed", "label": key, "sort": 91},
        ).status_code == 201
    parent = client.post("/api/v1/tags", headers=admin_headers, json={"key": "kb8a", "value": "p"}).json()
    r = client.post(
        "/api/v1/tags",
        headers=admin_headers,
        json={"key": "kb8b", "value": "c", "parent_id": parent["id"]},
    )
    assert r.status_code == 422, r.text


def test_delete_key_with_legacy_cross_key_child_is_409(client, admin_headers):
    """历史脏数据（跨 key 父子）下删键返回 409，而不是外键抛 500。"""
    for key in ("kb9a", "kb9b"):
        assert client.post(
            "/api/v1/tags/admin/tag-keys",
            headers=admin_headers,
            json={"key": key, "mode": "fixed", "label": key, "sort": 92},
        ).status_code == 201
    parent = client.post("/api/v1/tags", headers=admin_headers, json={"key": "kb9a", "value": "p"}).json()
    db = _db()
    try:
        db.add(Tag(key="kb9b", value="legacy-child", parent_id=parent["id"]))
        db.commit()
    finally:
        db.close()
    r = client.delete("/api/v1/tags/admin/tag-keys/kb9a", headers=admin_headers)
    assert r.status_code == 409, r.text


def test_delete_parent_value_is_409(client, admin_headers):
    """删除作为父级的标签值也要 409（不做静默级联）。"""
    assert client.post(
        "/api/v1/tags/admin/tag-keys",
        headers=admin_headers,
        json={"key": "kb9c", "mode": "fixed", "label": "kb9c", "sort": 93},
    ).status_code == 201
    parent = client.post("/api/v1/tags", headers=admin_headers, json={"key": "kb9c", "value": "p"}).json()
    assert client.post(
        "/api/v1/tags", headers=admin_headers, json={"key": "kb9c", "value": "c", "parent_id": parent["id"]}
    ).status_code == 201
    r = client.delete("/api/v1/tags/admin/tag-keys/kb9c/values/p", headers=admin_headers)
    assert r.status_code == 409, r.text


# ---------------- KB-6：建议绑定作品需授权 ----------------


def test_suggestion_demo_id_requires_ownership(client, admin_headers, auth_headers):
    """申请绑定的作品必须是自己的（或匿名作品），否则 403/404。

    修之前：任何匿名请求都能把申请挂到别人的作品上，管理员批准即等于替他人改标签。
    """
    h_a, _ = auth_headers()
    h_b, _ = auth_headers()
    up = _upload(client, h_a, "KB10 A 的作品", ["model:dsv4-flash", "type:game"])
    assert up.status_code == 201, up.text
    demo_id = up.json()["id"]

    r = client.post(
        "/api/v1/tags/suggestions",
        headers=h_b,
        json={"key": "model", "value": "kb10-evil", "description": "", "demo_id": demo_id},
    )
    assert r.status_code == 403, r.text

    r = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "model", "value": "kb10-evil2", "description": "", "demo_id": demo_id},
    )
    assert r.status_code == 403, r.text

    r = client.post(
        "/api/v1/tags/suggestions",
        headers=h_a,
        json={"key": "model", "value": "kb10-evil3", "description": "", "demo_id": 999999},
    )
    assert r.status_code == 404, r.text

    r = client.post(
        "/api/v1/tags/suggestions",
        headers=h_a,
        json={"key": "model", "value": "kb10-mine", "description": "", "demo_id": demo_id},
    )
    assert r.status_code == 201, r.text

    # 匿名上传的作品（author_id 为空）仍可回挂：上传即申请是已发布契约
    anon = _upload(client, None, "KB10 匿名作品", ["model:dsv4-flash", "type:game"])
    assert anon.status_code == 201, anon.text
    r = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "model", "value": "kb10-anon", "description": "", "demo_id": anon.json()["id"]},
    )
    assert r.status_code == 201, r.text


# ---------------- KB-7 / KB-8：KPI 与排序 ----------------


def test_knowledge_stats_counts_normalized_duplicate_names(client, admin_headers):
    """重名口径按规范化名称（修前按唯一列 slug 分组，恒为 0）。"""
    db = _db()
    try:
        db.add(Model(slug="kb11-foo-bar", name="KB11 Foo-Bar", status="active", resolution="exact"))
        db.add(Model(slug="kb11-foobar", name="KB11 FooBar", status="active", resolution="exact"))
        db.commit()
    finally:
        db.close()
    st = client.get("/api/v1/admin/knowledge/stats", headers=admin_headers).json()
    assert st["duplicate_slugs"] >= 1, st["duplicate_slugs"]
    assert any(g["normalized"] == "kb11foobar" for g in st["duplicate_names"]), st["duplicate_names"]


def test_model_score_sort_matches_displayed_score(client):
    """按 score 排序时，展示值序列必须单调不增（同分比票数），零票排最后。

    修前用未取整分排序、按取整分展示，同分时会出现「1 票压过 2 票」的矛盾；
    零票模型还会按先验 C 混在中游（显示没有分、位置却在中游）。
    """
    # 自带样本：没有评分数据时列表全是零票，断言会空转
    db = _db()
    try:
        for i, (avg, votes) in enumerate(((5.0, 1), (4.5, 2), (4.7, 40), (3.2, 9))):
            m = Model(
                slug=f"kb12-sort-{i}",
                name=f"KB12 Sort {i}",
                status="active",
                resolution="exact",
            )
            db.add(m)
            db.flush()
            for j in range(1):
                d = Demo(
                    slug=f"kb12-sort-{i}-{j}",
                    title=f"KB12 作品 {i}-{j}",
                    description="排序回归",
                    status="approved",
                    demo_type="web",
                    prompt="",
                    rating_avg=avg,
                    rating_count=votes,
                    rating_sum=int(avg * votes),
                )
                db.add(d)
                db.flush()
                from app.models import DemoModel

                db.add(DemoModel(demo_id=d.id, model_id=m.id))
        db.add(Model(slug="kb12-novote", name="KB12 NoVote", status="active", resolution="exact"))
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/models?sort=score&page_size=100")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    scored = [m for m in items if m["score"] is not None]
    assert len(scored) >= 3, [(m["name"], m["score"], m["votes"]) for m in items[:10]]
    keys = [(-m["score"], -m["votes"]) for m in scored]
    assert keys == sorted(keys), [(m["name"], m["score"], m["votes"]) for m in scored]

    none_idx = [i for i, m in enumerate(items) if m["score"] is None]
    scored_idx = [i for i, m in enumerate(items) if m["score"] is not None]
    if none_idx and scored_idx:
        assert max(scored_idx) < min(none_idx), "零票模型没有排在有分模型之后"
