"""astra 橱窗可见域集成测试：Host 判定 → 内容过滤 → API 白名单 → 预览门禁 → 策展接口 → site-info 分域。

约定：conftest 已把 DB/存储指到临时目录；TestClient 的 base_url 决定 Host 头，
"http://astrademos.top" 命中 settings.astra_hosts 默认值 → astra 视区；"http://testserver" → deep。
"""

import os

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def astra_client():
    with TestClient(app, base_url="http://astrademos.top") as c:
        yield c


def _uniq() -> str:
    return os.urandom(3).hex()


def _upload(client, headers, title: str) -> str:
    """走真实上传通道（单文件 HTML，auto_approve=true 直接上架）。返回 slug。
    正文嵌 title 唯一 token：绕开同作者内容去重（409）。"""
    body = f"<!doctype html><html><body>{title}</body></html>".encode()
    r = client.post(
        "/api/v1/demos",
        data={
            "title": title,
            "description": "scope test",
            "tags": '["model:ds-unknown"]',
            "demo_type": "web",
        },
        files={"file": ("index.html", body, "text/html")},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _curate(client, admin_headers, slug: str, **body):
    r = client.put(f"/api/v1/admin/demos/{slug}/curation", json=body, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


def _list_slugs(client, **params) -> list[str]:
    r = client.get("/api/v1/demos", params={"page_size": 100, **params})
    assert r.status_code == 200, r.text
    return [d["slug"] for d in r.json()["items"]]


def test_deep_untouched_default(client, admin_headers):
    """新上传默认 sites=deep：deep 域可见（存量行为不变），astra 域不可见。"""
    token = _uniq()
    slug = _upload(client, admin_headers, f"deep-only-{token}")
    assert slug in _list_slugs(client, q=token)
    # 策展接口回读默认值
    r = client.get("/api/v1/admin/demos", headers=admin_headers)
    row = next(d for d in r.json() if d["slug"] == slug)
    assert row["sites"] == "deep" and row["lang"] == "zh"


def test_curation_moves_between_scopes(client, astra_client, admin_headers):
    """astra-only：deep 列表消失、astra 列表出现（署名 astra lab），详情跨域 404。"""
    token = _uniq()
    slug = _upload(client, admin_headers, f"curated-{token}")
    out = _curate(client, admin_headers, slug, sites=["astra"], lang="en")
    assert out == {"slug": slug, "sites": "astra", "lang": "en"}

    assert slug not in _list_slugs(client, q=token)  # deep 下架
    astra_slugs = _list_slugs(astra_client)
    assert slug in astra_slugs  # astra 上架

    # 输出层：作者匿名化为实验室署名，内部标签被过滤
    r = astra_client.get(f"/api/v1/demos/{slug}")
    assert r.status_code == 200
    body = r.json()
    assert body["author"] == "astra lab"
    assert not [t for t in body["tags"] if t["key"] in ("author", "version-of")]
    # 原始数据未动：deep 管理面仍是真实署名与 sites
    admin_row = next(d for d in client.get("/api/v1/admin/demos", headers=admin_headers).json() if d["slug"] == slug)
    assert admin_row["author"] == "admin" and admin_row["sites"] == "astra"

    # 跨域详情 404：astra-only 在 deep 域 = 不存在
    assert client.get(f"/api/v1/demos/{slug}").status_code == 404


def test_both_visibility(client, astra_client, admin_headers):
    """deep,astra 双栖：两个域都可见；撤销 astra 后橱窗消失。"""
    token = _uniq()
    slug = _upload(client, admin_headers, f"both-{token}")
    out = _curate(client, admin_headers, slug, sites=["astra", "deep"])
    assert out["sites"] == "deep,astra"  # 规范化存储顺序
    assert slug in _list_slugs(astra_client)
    assert slug in _list_slugs(client, q=token)

    _curate(client, admin_headers, slug, sites=["deep"])
    assert slug not in _list_slugs(astra_client)
    assert slug in _list_slugs(client, q=token)


def test_astra_blacklist(client, astra_client):
    """橱窗白名单制：论坛/评论/登录/上传/docs/管理/相关推荐/session-logs 全部 404。"""
    assert astra_client.get("/docs").status_code == 404
    assert astra_client.get("/api/v1/forum/topics").status_code == 404
    assert astra_client.post("/api/v1/auth/login", json={"username": "x", "password": "y"}).status_code == 404
    assert astra_client.get("/api/v1/tags/tag-keys").status_code == 404
    assert astra_client.get("/api/v1/stats").status_code == 404
    assert astra_client.get("/api/v1").status_code == 404
    assert astra_client.post("/api/v1/demos", data={"title": "x"}).status_code == 404
    # 前缀放行下的子资源剔除
    assert astra_client.get("/api/v1/demos/whatever/related").status_code == 404
    assert astra_client.get("/api/v1/demos/whatever/session-logs").status_code == 404
    # 白名单内路径可达（未被 middleware 拦截；404/200 取决于数据，不能是白名单 404）
    r = astra_client.get("/api/v1/demos")
    assert r.status_code == 200
    assert astra_client.get("/api/v1/health").status_code == 200
    # deep 域一切照旧
    assert client.get("/docs").status_code == 200


def test_preview_gate(client, astra_client, admin_headers):
    """预览门禁双向：astra 域只出策展池；deep 域不可见 astra-only 的预览。"""
    token = _uniq()
    slug = _upload(client, admin_headers, f"prev-{token}")
    # deep 域默认可预览（尚未策展）
    assert client.get(f"/preview/{slug}/index.html").status_code == 200
    # 策展为 astra-only 后：deep 域预览 404、astra 域 200（curation 接口即时失效缓存）
    _curate(client, admin_headers, slug, sites=["astra"])
    assert client.get(f"/preview/{slug}/index.html").status_code == 404
    assert astra_client.get(f"/preview/{slug}/index.html").status_code == 200
    # astra 域探池外 slug = 404
    assert astra_client.get("/preview/no-such-slug-xyz/index.html").status_code == 404


def test_site_info_scoped(client, astra_client):
    """site-info 分域：astra 橱窗 fun_mode 恒真、社区/论坛归零、不广播上传通道。"""
    a = astra_client.get("/api/v1/meta/site-info")
    assert a.status_code == 200
    ab = a.json()
    assert ab["display"]["fun_mode"] is True
    assert ab["content"]["forum_topics"] == 0
    assert ab["community"]["users_total"] == 0
    assert ab["capabilities"]["upload"]["anonymous"] is False
    assert ab["capabilities"]["features"]["forum"] is False

    d = client.get("/api/v1/meta/site-info").json()
    assert d["content"]["forum_topics"] >= 1  # 主站有 seeded 首帖
    assert d["capabilities"]["upload"]["anonymous"] is True


def test_random_sort_respects_scope(client, astra_client, admin_headers):
    """sort=random 缓存按视区分键：astra 随机页里不能混进主站作品。"""
    slug = _upload(client, admin_headers, f"rand-{_uniq()}")
    _curate(client, admin_headers, slug, sites=["astra"])
    astra_pool = set(_list_slugs(astra_client, page_size=100))
    assert slug in astra_pool
    for _ in range(3):
        assert set(_list_slugs(astra_client, sort="random")) <= astra_pool
