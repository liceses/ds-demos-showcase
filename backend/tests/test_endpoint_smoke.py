"""端点冒烟：所有 GET 路由都不许 5xx（KB-27）。

为什么需要它：`/admin/stats` 曾因 `admin.py` 缺 `import time` 在生产 500（容器日志实证），
而当时 203 条测试全绿 —— 因为没有任何用例打到那个端点。NameError/TypeError 这类
「只在某个分支才炸」的问题，只有把每个端点都真打一遍才兜得住。
"""

import json
import re

from app.models import Demo, ForumReply, ForumTopic, Model, Task, User


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, headers, title, tags=("model:dsv4-flash", "type:game")):
    files = {"file": ("index.html", f"<!doctype html><body>{title}</body>".encode(), "text/html")}
    return client.post(
        "/api/v1/demos",
        headers=headers,
        data={"title": title, "description": "smoke", "demo_type": "web",
              "tags": json.dumps(list(tags)), "model_hint": "冒烟"},
        files=files,
    )


def _fixtures(client, admin_headers):
    """造一整套真实 id，供带路径参数的端点使用。"""
    demo = _upload(client, admin_headers, "KB27 冒烟作品").json()
    model = client.post(
        "/api/v1/admin/models", headers=admin_headers, json={"name": "kb27-smoke-model", "status": "active"}
    ).json()
    task = client.post(
        "/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB27 冒烟题", "status": "active"}
    ).json()
    key = "kb27key"
    client.post("/api/v1/tags/admin/tag-keys", headers=admin_headers,
                json={"key": key, "mode": "fixed", "label": "冒烟键", "sort": 96})
    tag = client.post("/api/v1/tags", headers=admin_headers,
                      json={"key": key, "value": "v1", "description": ""}).json()
    ann = client.post("/api/v1/admin/announcements", headers=admin_headers,
                      json={"title": "KB27 冒烟公告", "content": "x"}).json()
    suggestion = client.post(
        "/api/v1/tags/suggestions",
        json={"key": "model", "value": "kb27-smoke-suggestion", "description": ""},
    ).json()

    db = _db()
    try:
        uid = db.query(User.id).filter(User.username == "admin").scalar()
        topic = ForumTopic(title="KB27 冒烟主题", content="x", author_id=uid, status="normal")
        db.add(topic)
        db.commit()
        tid = topic.id
        reply = ForumReply(topic_id=tid, author_id=uid, content="x", status="normal")
        db.add(reply)
        db.commit()
        rid = reply.id
    finally:
        db.close()

    return {
        "slug": demo["slug"],
        "ident": model["slug"],
        "task": task["slug"],
        "key_value": f"{key}:v1",
        "key": key,
        "value": "v1",
        "tag_id": str(tag["id"]),
        "ann_id": str(ann["id"]),
        "sid": str(suggestion["id"]),
        "tid": str(tid),
        "rid": str(rid),
        "username": "admin",
        "user_id": str(uid),
        "demo_id": str(demo["id"]),
    }


def _get_routes():
    """从 OpenAPI schema 取全部 GET 路径。

    注意：新版 FastAPI 的 `app.routes` 只保留 include_router 后的单个聚合项
    （实测只能看到 9 条），必须走 schema 才能拿到完整端点表。
    """
    from app.main import app

    return sorted(path for path, ops in app.openapi()["paths"].items() if "get" in ops)


def _render(path: str, samples: dict) -> str | None:
    """把 /a/{b}/c/{d} 里的参数替换成样例值；缺样例返回 None（跳过）。"""
    names = re.findall(r"\{([^}:]+)(?::[^}]+)?\}", path)
    url = path
    for name in names:
        if name == "path":  # 通配路径按端点特判
            value = "covers/default.svg" if path.startswith("/media") else "index.html"
        elif name in samples:
            value = samples[name]
        else:
            return None
        url = re.sub(r"\{" + re.escape(name) + r"(?::[^}]+)?\}", value, url, count=1)
    return url


def test_all_get_endpoints_do_not_500(client, admin_headers):
    """每个 GET 端点真打一遍：任何 5xx 都算回归（覆盖 NameError/TypeError/序列化炸）。"""
    samples = _fixtures(client, admin_headers)
    failures: list[str] = []
    checked = 0
    for path in _get_routes():
        if path in ("/docs", "/openapi.json", "/docs/oauth2-redirect", "/redoc"):
            continue
        url = _render(path, samples)
        if url is None:
            continue
        r = client.get(url, headers=admin_headers)
        checked += 1
        if r.status_code >= 500:
            failures.append(f"{path} -> {r.status_code} {r.text[:160]}")
    assert checked >= 60, f"只打到 {checked} 个端点，冒烟覆盖不足"
    assert not failures, "GET 端点出现 5xx：\n" + "\n".join(failures)


def test_admin_stats_and_storage_status_payload(client, admin_headers):
    """/admin/stats 与 /admin/storage-status 的字段契约（缺 import time 时这里直接 500）。"""
    stats = client.get("/api/v1/admin/stats", headers=admin_headers)
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert {"demos", "users", "storage"} <= set(body)
    assert {"total", "approved", "pending", "rejected"} <= set(body["demos"])
    assert {"oss_enabled", "mode", "local_demos", "local_files", "local_size_bytes"} <= set(body["storage"])

    storage = client.get("/api/v1/admin/storage-status", headers=admin_headers)
    assert storage.status_code == 200, storage.text
    assert "mode" in storage.json()
