"""T3·M5-B2：Tag 状态机迁移测试（06 附录 B 实施 + 用户裁决三态 candidate|active|deprecated）。

锚点：
1. _ensure/ORM 列：新 Tag 落库默认 active（存量零回填由迁移承担）。
2. 独立跃迁端点 PUT /admin/entities/tag/{id}/status：service+审计、假动作 409、
   PATCH 白名单不含 status（不并入 PATCH 锁）、非法档 422。
3. 读口过滤：公开词表/公开详情剔除 deprecated；管理端词表全量可见（复活入口）；
   demo 作品卡 tags 不含 deprecated（列表 preload + 单条 fallback 双路径）。
"""

import os

from app.main import app
from fastapi.testclient import TestClient


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _probe_key_value(db, prefix: str = "b2probe"):
    """注册一次性固定键 + 插一个值（全随机，不碰共享词表实体）。"""
    from app.models import Tag, TagKey

    key = f"{prefix}{os.urandom(3).hex()}"
    value = f"v{os.urandom(4).hex()}"
    if db.get(TagKey, key) is None:
        db.add(TagKey(key=key, mode="fixed", label="B2探针", description="", sort=99, tier=3))
    db.flush()
    tag = Tag(key=key, value=value, description="B2探针值")
    db.add(tag)
    db.commit()
    db.refresh(tag)
    out = {"id": tag.id, "key": key, "value": value, "status": tag.status}
    db.close()
    return out


def test_tag_defaults_active(client: TestClient):
    db = _db()
    from app.models import Tag

    t = Tag(key="b2def", value=os.urandom(4).hex(), description="")
    db.add(t)
    db.commit()
    db.refresh(t)
    assert t.status == "active"
    db.close()


def _mk_demo(client: TestClient, admin_headers, tags_json: str) -> str:
    title = f"B2探针件-{os.urandom(3).hex()}"
    data = {
        "title": title,
        "description": "Tag 状态机读口测试",
        "demo_type": "web",
        "prompt": "测试提示词",
        "tags": tags_json,
    }
    body = f"<!doctype html><html><body>{os.urandom(6).hex()}</body></html>".encode()
    r = client.post(
        "/api/v1/demos",
        data=data,
        files={"file": ("index.html", body, "text/html")},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def test_admin_status_transition_writes_audit_and_rejects_fake(client: TestClient, admin_headers):
    tag = _probe_key_value(_db())
    # active → deprecated
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "deprecated", "reason": "并入新值（测试）"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "deprecated"
    # 审计落行（action=status_set，entity_type=tag）
    a = client.get(
        f"/api/v1/admin/audit?entity_type=tag&entity_id={tag['id']}&action=status_set",
        headers=admin_headers,
    ).json()
    assert a["total"] >= 1
    assert any((e.get("reason") or "") == "并入新值（测试）" for e in a["items"])
    # 假动作：同状态重复 → 409
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "deprecated", "reason": "重复"},
        headers=admin_headers,
    )
    assert r.status_code == 409, r.text
    # deprecated → active（复活）
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "active", "reason": "撤销废弃"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"
    # 非法档 422
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "hidden", "reason": "x"},
        headers=admin_headers,
    )
    assert r.status_code == 422, r.text
    # 不存在 → 404
    r = client.put(
        "/api/v1/admin/entities/tag/99999999/status",
        json={"status": "active", "reason": "x"},
        headers=admin_headers,
    )
    assert r.status_code == 404, r.text


def test_patch_whitelist_rejects_status(client: TestClient, admin_headers):
    """状态机不走 PATCH（不并入 PATCH 锁）：tag PATCH 白名单外 status → 422。"""
    tag = _probe_key_value(_db())
    r = client.patch(
        f"/api/v1/admin/entities/tag/{tag['id']}",
        json={"status": "deprecated", "reason": "越权"},
        headers=admin_headers,
    )
    assert r.status_code == 422, r.text


def test_public_reads_filter_deprecated_admin_reads_keep(client: TestClient, admin_headers, auth_headers):
    tag = _probe_key_value(_db())
    kv = f"{tag['key']}:{tag['value']}"
    # 公开详情：active 时 200
    assert client.get(f"/api/v1/tags/{kv}").status_code == 200
    # 公开词表（含值）出现
    pub_keys = client.get("/api/v1/tags/tag-keys").json()
    pub_rows = [v for k in pub_keys if k["key"] == tag["key"] for v in k["values"]]
    assert any(v["id"] == tag["id"] and v["status"] == "active" for v in pub_rows)

    # 置为 deprecated
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "deprecated", "reason": "读口过滤测试"},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # 公开详情 → 404（已退役公开页不再出现）
    assert client.get(f"/api/v1/tags/{kv}").status_code == 404
    # 公开词表 → 剔除
    pub_keys = client.get("/api/v1/tags/tag-keys").json()
    pub_rows = [v for k in pub_keys if k["key"] == tag["key"] for v in k["values"]]
    assert not any(v["id"] == tag["id"] for v in pub_rows)
    # 管理端词表 → 保留 + 状态徽章字段（复活入口数据源）
    admin_keys = client.get("/api/v1/tags/admin/tag-keys", headers=admin_headers).json()
    admin_rows = [v for k in admin_keys if k["key"] == tag["key"] for v in k["values"]]
    assert any(v["id"] == tag["id"] and v["status"] == "deprecated" for v in admin_rows)
    # 非管理员（普通注册用户）访问管理端词表 → 403
    user_h, _ = auth_headers()
    assert client.get("/api/v1/tags/admin/tag-keys", headers=user_h).status_code == 403


def test_demo_tags_exclude_deprecated(client: TestClient, admin_headers):
    """作品卡/详情 tags 剔除 deprecated：列表 preload（SQL 过滤）+ 单条 fallback 双路径。"""
    tag = _probe_key_value(_db())
    kv = f"{tag['key']}:{tag['value']}"
    slug = _mk_demo(client, admin_headers, f'["model:dsv4-flash", "{kv}"]')

    # active：卡与详情都带
    r = client.get(f"/api/v1/demos/{slug}")
    assert r.status_code == 200
    assert any(x["key"] == tag["key"] for x in r.json()["tags"])
    listed = client.get("/api/v1/demos", params={"page_size": 100}).json()["items"]
    mine = next(d for d in listed if d["slug"] == slug)
    assert any(x["key"] == tag["key"] for x in mine["tags"])

    # 置 deprecated 后：卡与详情都不带（值本体仍在库、关联未删——只藏展示）
    r = client.put(
        f"/api/v1/admin/entities/tag/{tag['id']}/status",
        json={"status": "deprecated", "reason": "作品卡过滤测试"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    r = client.get(f"/api/v1/demos/{slug}")
    assert r.status_code == 200
    assert not any(x["key"] == tag["key"] for x in r.json()["tags"])
    listed = client.get("/api/v1/demos", params={"page_size": 100}).json()["items"]
    mine = next(d for d in listed if d["slug"] == slug)
    assert not any(x["key"] == tag["key"] for x in mine["tags"])
    # 关联仍在（未被误删）
    db = _db()
    from app.models import DemoTag

    n = db.query(DemoTag).filter(DemoTag.tag_id == tag["id"]).count()
    db.close()
    assert n >= 1
