"""T3·M5-B1：demo 讨论数（comment_count）口径 = 关联论坛主题回复数（用户裁决 b）。

背景：评论系统已 410、发言导流论坛；历史评论经 migrate_comments_to_forum.py 迁为
demo_slug 关联主题的回复（reply_count 覆盖历史数）。serializers 不再查已退役
Comment 表。

本测试锚定三条：
1. 列表 preload 路径按 **slug** 取数（forum_topics.demo_slug 关联 demos.slug——
   前手半成品把结果按 slug 装 dict 却按 id 取，恒 0 的回归锁）。
2. 单条（详情）fallback 路径同口径。
3. 只算 normal 主题：reviewing（未过审）主题的回复不进公开讨论数。
"""

import os

# 每个用例独立的 demo 标题（slug 由标题派生，避免撞唯一键）
_SEQ = [0]


def _mk_demo(client, admin_headers) -> str:
    """管理员上传一件单文件 demo（AUTO_APPROVE=true → approved）。返回 slug。"""
    _SEQ[0] += 1
    title = f"B1讨论数探针{_SEQ[0]}-{os.urandom(3).hex()}"
    data = {
        "title": title,
        "description": "M5-B1 讨论数口径测试",
        "demo_type": "web",
        "prompt": "测试用提示词",
        "tags": '["model:dsv4-flash"]',
    }
    body = f"<!doctype html><html><body>{os.urandom(8).hex()}</body></html>".encode()
    r = client.post(
        "/api/v1/demos",
        data=data,
        files={"file": ("index.html", body, "text/html")},
        headers=admin_headers,
    )
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _detail_count(client, slug: str) -> int:
    r = client.get(f"/api/v1/demos/{slug}")
    assert r.status_code == 200, r.text
    return r.json()["comment_count"]


def _list_count(client, slug: str) -> int:
    """列表 preload 路径：在 /api/v1/demos 结果里按 slug 找 comment_count。"""
    r = client.get("/api/v1/demos", params={"page_size": 100})
    assert r.status_code == 200, r.text
    for item in r.json()["items"]:
        if item["slug"] == slug:
            return item["comment_count"]
    raise AssertionError(f"列表里找不到 {slug}")


def _post_topic(client, auth_headers, admin_headers, demo_slug: str) -> int:
    """新用户发 demo 讨论主题（reviewing）→ 管理员过审为 normal。返回 topic id。"""
    author_h, _ = auth_headers()
    r = client.post(
        "/api/v1/forum/topics",
        json={"title": "这个 demo 的讨论", "content": "正文", "demo_slug": demo_slug},
        headers=author_h,
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "reviewing"
    r = client.post(f"/api/v1/forum/admin/topics/{tid}/review", json={"action": "approve"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "normal"
    return tid


def _post_reply(client, auth_headers, admin_headers, tid: int):
    """新用户回复（reviewing）→ 管理员过审 → reply_count +1（正常楼）。"""
    reply_h, _ = auth_headers()
    r = client.post(
        f"/api/v1/forum/topics/{tid}/replies",
        json={"content": "一条讨论回复"},
        headers=reply_h,
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "reviewing"
    r = client.post(f"/api/v1/forum/admin/replies/{rid}/review", json={"action": "approve"}, headers=admin_headers)
    assert r.status_code == 200, r.text


def test_demo_comment_count_zero_without_topics(client, admin_headers):
    slug = _mk_demo(client, admin_headers)
    assert _detail_count(client, slug) == 0
    assert _list_count(client, slug) == 0


def test_demo_comment_count_sums_normal_topic_replies(client, admin_headers, auth_headers):
    slug = _mk_demo(client, admin_headers)
    tid = _post_topic(client, auth_headers, admin_headers, slug)
    # 3 个不同用户的回复逐一过审（reply_count 跟随 +1）
    for _ in range(3):
        _post_reply(client, auth_headers, admin_headers, tid)

    assert _detail_count(client, slug) == 3
    assert _list_count(client, slug) == 3  # 列表 preload 的 slug 键回归锚点


def test_reviewing_topic_does_not_count(client, admin_headers, auth_headers):
    slug = _mk_demo(client, admin_headers)
    tid = _post_topic(client, auth_headers, admin_headers, slug)
    _post_reply(client, auth_headers, admin_headers, tid)
    assert _detail_count(client, slug) == 1

    # 第二个主题留在 reviewing（不过审）→ 其回复不计入公开讨论数
    author_h, _ = auth_headers()
    r = client.post(
        "/api/v1/forum/topics",
        json={"title": "未过审的讨论", "content": "正文", "demo_slug": slug},
        headers=author_h,
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "reviewing"
    assert _detail_count(client, slug) == 1
