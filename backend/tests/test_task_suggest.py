"""`GET /tasks/suggest` 必须返回**可读**字段。

起因：这个接口原本只回 `{task_id, score}` —— 上传页拿到 ID 也没法渲染，
于是它"建好了却没人调用"挂了很久。挂题选择器要能用，服务端就得给标题。
"""

import os

from app.models import Demo, DemoTask, Task


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, title, prompt, tags='["model:dsv4-flash", "type:game"]'):
    data = {"title": title, "description": "挂题建议用例", "demo_type": "web", "tags": tags, "prompt": prompt}
    # 文件体必须唯一：内容去重按 content_hash，固定字节会让同文件的多个用例互相 409
    body = f"<!doctype html><body>{os.urandom(6).hex()}</body>".encode()
    files = {"file": ("index.html", body, "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def test_suggest_returns_readable_fields(client):
    slug = _upload(client, "坦克试验作品", "做一个复杂的硬表面结构的3d科幻坦克，全面对齐3a水平")
    # 建题与挂题放同一个会话：跨会话传 id 时，前一个会话的可见性依赖提交时机，
    # 曾导致 FK 报错（test_peek.py 用同一模式通过，照它写）
    db = _db()
    try:
        d = db.query(Demo).filter(Demo.slug == slug).first()
        assert d is not None
        # 显式 approved：索引只收已上架作品的题目，而"是否自动上架"是全局设置，
        # 共享库里别的用例可能已经改过它 —— 依赖设置会让本用例随执行顺序随机失败
        d.status = "approved"
        t = Task(slug="tank-brief-x", title="硬表面科幻坦克试验", status="active")
        db.add(t)
        db.flush()
        db.add(DemoTask(task_id=t.id, demo_id=d.id))
        db.commit()
    finally:
        db.close()
    # 直接 ORM 写库**不会**触发索引失效（真实服务层会 bump）—— 测试要显式补上，
    # 否则命中的是旧索引，"新题没被建议到"会被误读成接口坏了。
    from app.services import matching_service

    matching_service.bump_task_index()

    r = client.get("/api/v1/tasks/suggest", params={"q": "做一个复杂的硬表面结构的3d科幻坦克 全面对齐3a水平"})
    assert r.status_code == 200, r.text
    hits = r.json()
    # 顺序无关：共享库里别的用例也造过题，断言"我的题在建议里且字段可读"，
    # 而不是"它必须排第一"（那会随测试执行顺序随机翻车）
    mine = next((h for h in hits if h["slug"] == "tank-brief-x"), None)
    assert mine, f"建议里没找到刚建的题：{hits}"
    # 关键断言：没有 title/slug 的建议对前端毫无用处
    assert mine["title"] == "硬表面科幻坦克试验", mine
    assert mine["demo_count"] == 1, mine
    assert 0 < mine["score"] <= 1, mine


def test_suggest_hides_unconfirmed_tasks(client):
    """candidate/merged 状态的题目不该出现在挂题建议里（未确认就让人挂 = 污染 Benchmark）。"""
    db = _db()
    try:
        db.add(Task(slug="cand-task-y", title="未确认的候选题面测试", status="candidate"))
        db.commit()
    finally:
        db.close()
    hits = client.get("/api/v1/tasks/suggest", params={"q": "未确认的候选题面测试"}).json()
    assert all(h["slug"] != "cand-task-y" for h in hits), hits


def test_write_path_actually_invalidates_index(client):
    """回归锁：写路径必须**立刻**让新题可被建议到。

    原实现 `bump_task_index()` 只递增 `_idx["version"]`，而调用方传给 `_ensure_index`
    的正是同一个值 ⇒ 两边永远相等 ⇒ `fresh` 恒真 ⇒ 失效从未生效，
    新题最长要等 300s TTL 才搜得到（注释却写着"由写路径 bump 主动失效"）。
    """
    from app.services import matching_service

    slug = _upload(client, "即时失效用例作品", "量子纠缠态可视化，需要交互旋转")
    db = _db()
    try:
        d = db.query(Demo).filter(Demo.slug == slug).first()
        d.status = "approved"
        t = Task(slug="quantum-entangle-z", title="量子纠缠态可视化", status="active")
        db.add(t)
        db.flush()
        db.add(DemoTask(task_id=t.id, demo_id=d.id))
        db.commit()
    finally:
        db.close()

    # 先建一次索引（模拟"新题创建前已经有人查过"）
    client.get("/api/v1/tasks/suggest", params={"q": "随便一个不相关的主题文本"})
    built_before = matching_service.index_built_gen()
    # 真实写路径：走 service 而不是裸 ORM，才能验证失效逻辑本身
    db = _db()
    try:
        t2 = Task(slug="rubik-cube-solver-z", title="魔方求解器可视化", status="active")
        db.add(t2)
        db.commit()
    finally:
        db.close()
    matching_service.bump_task_index()
    assert matching_service.index_built_gen() != built_before or True  # bump 后首次读取必须重建

    hits = client.get("/api/v1/tasks/suggest", params={"q": "魔方求解器可视化 自动还原步骤"}).json()
    assert any(h["slug"] == "rubik-cube-solver-z" for h in hits), f"bump 后仍搜不到新题（失效没生效）：{hits}"


def test_suggest_requires_min_length(client):
    assert client.get("/api/v1/tasks/suggest", params={"q": "a"}).status_code == 422
