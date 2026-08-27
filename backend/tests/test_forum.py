"""论坛核心路径：发帖审核→通过→回复→通知→锁定 403。"""


def _topic_headers(auth_headers, admin_headers, client):
    """注册一个新用户并发一个主题，审核通过，返回 (作者 headers, 主题 id)。"""
    author_h, _ = auth_headers()
    r = client.post(
        "/api/v1/forum/topics",
        json={"title": "测试主题", "content": "正文内容"},
        headers=author_h,
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert r.json()["status"] == "reviewing"  # 新用户需审核

    r = client.post(
        f"/api/v1/forum/admin/topics/{tid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "normal"
    return author_h, tid


def test_new_user_topic_needs_review_and_admin_approves(client, auth_headers, admin_headers):
    author_h, tid = _topic_headers(auth_headers, admin_headers, client)
    r = client.get(f"/api/v1/forum/topics/{tid}")
    assert r.status_code == 200
    assert r.json()["status"] == "normal"


def test_reply_notifies_author_and_locked_topic_403(client, auth_headers, admin_headers):
    author_h, tid = _topic_headers(auth_headers, admin_headers, client)
    other_h, _ = auth_headers()

    r = client.post(
        f"/api/v1/forum/topics/{tid}/replies",
        json={"content": "第一条回复"},
        headers=other_h,
    )
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "reviewing"  # 新用户回复也需审核

    # 审核通过 → 正常可见
    r = client.post(
        f"/api/v1/forum/admin/replies/{rid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "normal"

    # 通知作者
    r = client.get("/api/v1/notifications", headers=author_h)
    assert r.status_code == 200
    types = [n["type"] for n in r.json()]
    assert "forum_reply" in types

    # 锁定后 403
    r = client.put(
        f"/api/v1/forum/admin/topics/{tid}",
        json={"locked": True},
        headers=admin_headers,
    )
    assert r.status_code == 200
    r = client.post(
        f"/api/v1/forum/topics/{tid}/replies",
        json={"content": "锁后回复"},
        headers=other_h,
    )
    assert r.status_code == 403


def test_topic_reply_carry_reaction_fields(client, auth_headers, admin_headers):
    author_h, tid = _topic_headers(auth_headers, admin_headers, client)
    other_h, _ = auth_headers()
    r = client.post(f"/api/v1/forum/topics/{tid}/replies", json={"content": "带计数回复"}, headers=other_h)
    assert r.status_code == 201
    rid = r.json()["id"]
    # 新用户回复需审核，通过后才进列表
    r = client.post(
        f"/api/v1/forum/admin/replies/{rid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert r.status_code == 200

    topic = client.get(f"/api/v1/forum/topics/{tid}").json()
    assert topic["like_count"] == 0
    assert topic["thanks_count"] == 0
    assert topic["my_reactions"] == []

    replies = client.get(f"/api/v1/forum/topics/{tid}/replies").json()["items"]
    assert replies[0]["like_count"] == 0
    assert replies[0]["id"] == rid
