"""收藏夹 + 浏览历史 + 账号资料（本轮新增功能的后端契约测试）。

复用 conftest 的 session 级 client（临时 SQLite + AUTO_APPROVE=true），不再自建 fixture ——
本项目既有测试都这么写，自建一份只会引入"环境变量设置时机"这类坑。

覆盖的都是"看起来能用但语义错了会很烦人"的点：
  · 私密夹对他人/匿名一律 **404**（不是 403 —— 403 会泄露"存在但你没权限"）；
  · 重复加入幂等、默认夹不可删/不可改名/不可转公开、上限；
  · 历史 upsert 只留最近一次 + 关闭开关后不写入且不动已有数据 + 清空只清自己；
  · 头像上传的校验与归一化（非图片 400、落盘 512×512 webp）+ 换头像删旧文件。
"""

from __future__ import annotations

import io
import json

from PIL import Image


def _register(client, username: str) -> dict:
    r = client.post("/api/v1/auth/register", json={"username": username, "password": "password123"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _upload_demo(client, title: str) -> str:
    """上传一个最小可用的 web 作品，返回 slug（直接读接口返回，别猜 slug 生成规则）。"""
    # 内容唯一：站点有“相同内容去重”（409），测试里多次上传必须各不相同
    html = ("<html><body>" + title + "</body></html>").encode("utf-8")
    r = client.post(
        "/api/v1/demos",
        # 上传必须带模型标签，且 tags 是 **JSON 数组**字符串（后端校验：至少 1 个 model:*）
        data={"title": title, "description": "d", "demo_type": "web", "tags": json.dumps(["model:unspecified"])},
        files={"file": ("index.html", io.BytesIO(html), "text/html")},
    )
    assert r.status_code in (200, 201), r.text
    slug = r.json().get("slug")
    assert slug, r.text
    return slug


def _png(w: int = 800, h: int = 600, color: tuple[int, int, int] = (120, 180, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


class TestCollections:
    def test_default_collection_autocreated_and_protected(self, client):
        _register(client, "col_alice")
        items = client.get("/api/v1/me/collections").json()["items"]
        assert len(items) == 1 and items[0]["is_default"] is True

        cid = items[0]["id"]
        assert client.delete(f"/api/v1/me/collections/{cid}").status_code == 400
        assert client.patch(f"/api/v1/me/collections/{cid}", json={"title": "x"}).status_code == 400
        assert client.patch(f"/api/v1/me/collections/{cid}", json={"visibility": "public"}).status_code == 400

    def test_toggle_and_add_is_idempotent(self, client):
        _register(client, "col_bob")
        slug = _upload_demo(client, "收藏测试作品A")

        assert client.post("/api/v1/me/favorites/toggle", json={"slug": slug}).json()["favorited"] is True
        assert client.post("/api/v1/me/favorites/toggle", json={"slug": slug}).json()["favorited"] is False

        cid = client.get("/api/v1/me/collections").json()["items"][0]["id"]
        assert client.post(f"/api/v1/me/collections/{cid}/items", json={"slug": slug}).status_code == 204
        assert client.post(f"/api/v1/me/collections/{cid}/items", json={"slug": slug}).status_code == 204
        assert client.get(f"/api/v1/me/collections/{cid}/items").json()["total"] == 1
        assert client.get(f"/api/v1/me/favorites/status?slug={slug}").json()["favorited"] is True

    def test_private_collection_404_for_others_and_anon(self, client):
        _register(client, "col_carol")
        cid = client.post("/api/v1/me/collections", json={"title": "私密夹", "visibility": "private"}).json()["id"]
        client.post("/api/v1/auth/logout")

        assert client.get(f"/api/v1/collections/{cid}").status_code == 404
        _register(client, "col_dave")
        assert client.get(f"/api/v1/collections/{cid}").status_code == 404
        assert client.get("/api/v1/users/col_carol/collections").json()["items"] == []

    def test_public_collection_readable_by_anon(self, client):
        _register(client, "col_erin")
        slug = _upload_demo(client, "公开夹里的作品")
        cid = client.post("/api/v1/me/collections", json={"title": "公开夹", "visibility": "public"}).json()["id"]
        client.post(f"/api/v1/me/collections/{cid}/items", json={"slug": slug})
        client.post("/api/v1/auth/logout")

        assert client.get(f"/api/v1/collections/{cid}").status_code == 200
        detail = client.get(f"/api/v1/collections/{cid}/items").json()
        assert detail["total"] == 1 and detail["items"][0]["demo"]["slug"] == slug
        pubs = client.get("/api/v1/users/col_erin/collections").json()["items"]
        assert len(pubs) == 1 and pubs[0]["title"] == "公开夹"
        assert pubs[0]["cover_urls"] != []  # 列表缩略：接口直接给封面，前端不用再逐夹请求

    def test_others_collection_cannot_be_modified(self, client):
        _register(client, "col_frank")
        cid = client.post("/api/v1/me/collections", json={"title": "F"}).json()["id"]
        client.post("/api/v1/auth/logout")
        _register(client, "col_grace")
        assert client.patch(f"/api/v1/me/collections/{cid}", json={"title": "hack"}).status_code == 404
        assert client.delete(f"/api/v1/me/collections/{cid}").status_code == 404

    def test_collection_limit(self, client):
        _register(client, "col_henry")
        for i in range(19):  # 19 + 默认夹 = 20
            assert client.post("/api/v1/me/collections", json={"title": f"c{i}"}).status_code == 201
        r = client.post("/api/v1/me/collections", json={"title": "over"})
        assert r.status_code == 400 and "最多" in r.json()["detail"]

    def test_rename_and_visibility_toggle(self, client):
        _register(client, "col_ivy")
        cid = client.post("/api/v1/me/collections", json={"title": "旧名"}).json()["id"]
        r = client.patch(f"/api/v1/me/collections/{cid}", json={"title": "新名", "visibility": "public"})
        assert r.status_code == 200
        assert r.json()["title"] == "新名" and r.json()["visibility"] == "public"


class TestHistory:
    def test_upsert_keeps_one_row_per_demo(self, client):
        _register(client, "his_ivan")
        slug = _upload_demo(client, "历史去重作品")
        for _ in range(3):
            assert client.post(f"/api/v1/me/history/{slug}").status_code == 204
        page = client.get("/api/v1/me/history").json()
        assert page["total"] == 1 and page["items"][0]["demo"]["slug"] == slug

    def test_disabled_switch_stops_recording_without_wiping(self, client):
        _register(client, "his_jane")
        slug = _upload_demo(client, "历史开关作品")
        client.post(f"/api/v1/me/history/{slug}")
        assert client.get("/api/v1/me/history").json()["total"] == 1

        assert client.patch("/api/v1/auth/me", json={"history_enabled": False}).json()["history_enabled"] is False
        assert client.post(f"/api/v1/me/history/{slug}").status_code == 204  # 静默成功
        # 关闭只停新记录，不动已有数据（"关闭"与"删除"是两件事）
        assert client.get("/api/v1/me/history").json()["total"] == 1

    def test_delete_one_and_clear(self, client):
        _register(client, "his_kate")
        s1 = _upload_demo(client, "历史清单一")
        s2 = _upload_demo(client, "历史清单二")
        client.post(f"/api/v1/me/history/{s1}")
        client.post(f"/api/v1/me/history/{s2}")
        assert client.delete(f"/api/v1/me/history/{s1}").status_code == 204
        assert client.get("/api/v1/me/history").json()["total"] == 1
        assert client.delete("/api/v1/me/history").status_code == 204
        assert client.get("/api/v1/me/history").json()["total"] == 0

    def test_history_is_per_user(self, client):
        _register(client, "his_leo")
        slug = _upload_demo(client, "别人的历史看不见")
        client.post(f"/api/v1/me/history/{slug}")
        client.post("/api/v1/auth/logout")
        _register(client, "his_mia")
        assert client.get("/api/v1/me/history").json()["total"] == 0

    def test_anonymous_cannot_record(self, client):
        client.post("/api/v1/auth/logout")
        assert client.post("/api/v1/me/history/whatever").status_code == 401


class TestAccount:
    def test_patch_me_updates_profile(self, client):
        _register(client, "acc_nina")
        r = client.patch("/api/v1/auth/me", json={"display_name": "狮子", "bio": "写 demo 的"})
        assert r.status_code == 200
        body = r.json()
        assert body["display_name"] == "狮子" and body["bio"] == "写 demo 的"
        assert client.get("/api/v1/auth/me").json()["display_name"] == "狮子"
        assert client.get("/api/v1/users/acc_nina").json()["display_name"] == "狮子"

    def test_avatar_upload_normalizes_replaces_and_removes(self, client):
        _register(client, "acc_olive")
        r = client.post("/api/v1/auth/me/avatar", files={"file": ("a.png", io.BytesIO(_png(800, 600)), "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["avatar_url"]
        assert url.startswith("/media/avatars/") and url.endswith(".webp")

        from app.config import settings

        path = settings.media_path / url.removeprefix("/media/")
        assert path.is_file()
        with Image.open(path) as im:  # 非方图进来 → 落盘 512×512
            assert im.size == (512, 512)

        # 第二张用不同颜色：换成真正不同的图（也顺带证明 URL 随内容变）
        r2 = client.post(
            "/api/v1/auth/me/avatar",
            files={"file": ("b.png", io.BytesIO(_png(600, 600, color=(40, 90, 200))), "image/png")},
        )
        assert r2.json()["avatar_url"] != url
        assert not path.exists()  # 换头像删旧文件

        assert client.delete("/api/v1/auth/me/avatar").status_code == 204
        assert client.get("/api/v1/auth/me").json()["avatar_url"] == ""

    def test_avatar_rejects_non_image(self, client):
        _register(client, "acc_pete")
        r = client.post("/api/v1/auth/me/avatar", files={"file": ("x.png", io.BytesIO(b"not an image"), "image/png")})
        assert r.status_code == 400

    def test_avatar_requires_login(self, client):
        client.post("/api/v1/auth/logout")
        r = client.post("/api/v1/auth/me/avatar", files={"file": ("a.png", io.BytesIO(_png()), "image/png")})
        assert r.status_code == 401
