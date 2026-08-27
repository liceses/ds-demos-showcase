"""社区互动：赞/感谢、声望、关注、只看关注过滤。"""


def _approved_topic(client, auth_headers, admin_headers):
    """建一个审核通过的主题，返回 (作者 headers, 作者名, 主题 dict)。"""
    author_h, author_name = auth_headers()
    r = client.post(
        "/api/v1/forum/topics",
        json={"title": "互动测试主题", "content": "正文"},
        headers=author_h,
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    client.post(
        f"/api/v1/forum/admin/topics/{tid}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    return author_h, author_name, client.get(f"/api/v1/forum/topics/{tid}").json()


def test_like_thanks_reputation_and_notification(client, auth_headers, admin_headers):
    author_h, author_name, topic = _approved_topic(client, auth_headers, admin_headers)
    fan_h, _ = auth_headers()
    tid = topic["id"]

    # 赞
    r = client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": tid, "reaction_type": "like"},
        headers=fan_h,
    )
    assert r.status_code == 200, r.text
    assert r.json()["active"] is True
    assert r.json()["like_count"] == 1

    # 感谢（赞 +1，感谢 +2）
    r = client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": tid, "reaction_type": "thanks"},
        headers=fan_h,
    )
    assert r.status_code == 200
    assert r.json()["thanks_count"] == 1

    # 作者声望 = 1 + 2 = 3
    profile = client.get(f"/api/v1/users/{author_name}/profile", headers=fan_h).json()
    assert profile["reputation"] == 3

    # 作者收到 forum_reaction 通知
    notifs = client.get("/api/v1/notifications", headers=author_h).json()
    assert any(n["type"] == "forum_reaction" for n in notifs)

    # 取消赞，声望回落到 2，计数归 0
    r = client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": tid, "reaction_type": "like"},
        headers=fan_h,
    )
    assert r.status_code == 200
    assert r.json()["active"] is False
    assert r.json()["like_count"] == 0
    assert client.get(f"/api/v1/users/{author_name}/profile").json()["reputation"] == 2


def test_cannot_react_to_own_content(client, auth_headers, admin_headers):
    author_h, _, topic = _approved_topic(client, auth_headers, admin_headers)
    r = client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": topic["id"], "reaction_type": "like"},
        headers=author_h,
    )
    assert r.status_code == 400


def test_follow_toggle_and_followed_filter(client, auth_headers, admin_headers):
    author_h, author_name, topic = _approved_topic(client, auth_headers, admin_headers)
    fan_h, _ = auth_headers()
    author_id = topic["author_id"]

    # 关注作者
    r = client.post(f"/api/v1/users/{author_id}/follow", headers=fan_h)
    assert r.status_code == 200, r.text
    assert r.json()["following"] is True

    profile = client.get(f"/api/v1/users/{author_name}/profile", headers=fan_h).json()
    assert profile["is_following"] is True
    assert profile["follower_count"] == 1

    # 只看关注过滤应包含该作者主题
    r = client.get("/api/v1/forum/topics?followed=1", headers=fan_h)
    assert r.status_code == 200
    ids = [t["id"] for t in r.json()["items"]]
    assert topic["id"] in ids

    # 取关
    r = client.post(f"/api/v1/users/{author_id}/follow", headers=fan_h)
    assert r.status_code == 200
    assert r.json()["following"] is False
    r = client.get("/api/v1/forum/topics?followed=1", headers=fan_h)
    assert topic["id"] not in [t["id"] for t in r.json()["items"]]


def test_cannot_follow_self(client, auth_headers):
    h, _ = auth_headers()
    me = client.get("/api/v1/auth/me", headers=h).json()
    r = client.post(f"/api/v1/users/{me['id']}/follow", headers=h)
    assert r.status_code == 400


def test_leaderboard_ranks_by_reputation_and_likes(client, auth_headers, admin_headers):
    author_h, author_name, topic = _approved_topic(client, auth_headers, admin_headers)
    fan_h, _ = auth_headers()
    tid = topic["id"]

    client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": tid, "reaction_type": "like"},
        headers=fan_h,
    )
    client.post(
        "/api/v1/forum/reactions",
        json={"target_type": "topic", "target_id": tid, "reaction_type": "thanks"},
        headers=fan_h,
    )

    r = client.get("/api/v1/users/leaderboard?sort=reputation")
    assert r.status_code == 200
    items = r.json()["items"]
    assert items[0]["username"] == author_name
    assert items[0]["reputation"] == 3
    assert items[0]["received_likes"] == 1
    assert items[0]["received_thanks"] == 1

    r = client.get("/api/v1/users/leaderboard?sort=likes")
    assert r.status_code == 200
    assert r.json()["items"][0]["username"] == author_name
