"""v2 B4′：挑战机制 —— 用户上传声明挂题，只生成候选，管理员 approve 才生效。

核心不变式（治理文档：用户贡献候选，管理员决定知识体系）：
  1. 带 task 上传成功 → DemoTask **不得**立刻出现（否则任何人都能污染 Benchmark）
  2. 候选必须可被默认收件箱看到（confidence 非 NULL 且 ≥ REVIEW 阈值）
  3. approve → 真挂题 + 题目对比行成立 + 审计留痕
  4. 非法/未确认题面 → 422，且**不得留下孤儿 demo**（校验在解压之前）
"""

import os

from app.models import Demo, EntitySuggestion, Task


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _seed_task(title="挑战测试题", status="active"):
    db = _db()
    t = Task(slug=f"chal-{os.urandom(3).hex()}", title=title, description="同一题面比不同模型", status=status)
    db.add(t)
    db.commit()
    tid, tslug, ttitle = t.id, t.slug, t.title
    db.close()
    return tid, tslug


def _upload(client, title, task=None, model="dsv4-flash"):
    data = {
        "title": title,
        "description": "挑战机制测试",
        "demo_type": "web",
        "prompt": "做一个会被挑战机制测试复用的提示词内容，包含 canvas 与交互。",
        "tags": f'["model:{model}", "type:effect"]',
    }
    if task:
        data["task"] = task
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    return client.post("/api/v1/demos", data=data, files=files)


def _pending_task_match(task_id, demo_id):
    db = _db()
    row = (
        db.query(EntitySuggestion)
        .filter(
            EntitySuggestion.kind == "task_match",
            EntitySuggestion.ref_id == task_id,
            EntitySuggestion.demo_id == demo_id,
            EntitySuggestion.status == "pending",
        )
        .first()
    )
    out = row.id if row else None
    conf = row.confidence if row else None
    src = row.source if row else None
    db.close()
    return out, conf, src


def test_challenge_upload_queues_suggestion_and_does_not_attach(client, admin_headers):
    """带 task 上传 → 只落候选，DemoTask 不产生。"""
    tid, tslug = _seed_task()
    r = _upload(client, "挑战者一号", task=tslug)
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]

    db = _db()
    did = db.query(Demo.id).filter(Demo.slug == slug).first().id
    from app.models import DemoTask

    attached = db.query(DemoTask).filter(DemoTask.demo_id == did, DemoTask.task_id == tid).first()
    db.close()
    assert attached is None, "用户自报就挂题 = Benchmark 可被任意塞入"

    sid, conf, src = _pending_task_match(tid, did)
    assert sid, "候选未入队"
    assert src == "user" and conf is not None and conf >= 0.6, "confidence 为 NULL 会被收件箱默认视图吞掉"

    # 默认视图能看见（不带 min_confidence）
    items = client.get("/api/v1/admin/suggestions", headers=admin_headers).json()["items"]
    assert sid in {x["id"] for x in items}, "用户挑战请求在收件箱默认视图不可见"
    assert client.get("/api/v1/admin/suggestions", headers=admin_headers).json()["pending_by_kind"].get("task_match", 0) >= 1


def test_challenge_duplicate_declaration_is_deduped(client, admin_headers):
    """同一 demo+task 重复声明只留一条 pending（收件箱不堆噪音）。"""
    tid, tslug = _seed_task()
    r = _upload(client, "重复声明", task=tslug)
    slug = r.json()["slug"]
    db = _db()
    did = db.query(Demo.id).filter(Demo.slug == slug).first().id
    db.close()

    first, _, _ = _pending_task_match(tid, did)
    # 直接再走一次服务层同参数创建：应返回 None（去重）
    from app.services import suggestion_service

    db = _db()
    dup = suggestion_service.create(
        db, kind="task_match", payload={"task_id": tid, "demo_id": did},
        confidence=0.9, source="user", demo_id=did, ref_id=tid,
    )
    db.close()
    assert dup is None
    assert first


def test_approve_challenge_attaches_and_builds_benchmark(client, admin_headers):
    """批准候选 → 真挂题 → 题目对比行出现该模型；审计留痕。"""
    tid, tslug = _seed_task()
    r = _upload(client, "待批准挑战", task=tslug)
    slug = r.json()["slug"]
    db = _db()
    did = db.query(Demo.id).filter(Demo.slug == slug).first().id
    db.close()
    sid, _, _ = _pending_task_match(tid, did)
    assert sid

    res = client.post(f"/api/v1/admin/suggestions/{sid}/review", json={"action": "approve"}, headers=admin_headers)
    assert res.status_code == 200, res.text

    detail = client.get(f"/api/v1/tasks/{tslug}").json()
    assert slug in {d["slug"] for d in detail["demos"]}, "批准后未真正挂题"
    assert any(row["model"]["name"] == "dsv4-flash" for row in detail["compare"]), "对比行未成形"

    audit = client.get("/api/v1/admin/audit?entity_type=suggestion", headers=admin_headers).json()["items"]
    assert any(a["id"] == sid or a["entity_id"] == sid for a in audit), "审核未落审计"

    # 挂题后 covered 应生效（聚类面板不再推同一批）
    clusters = client.get("/api/v1/admin/prompt-clusters?refresh=1&min_score=0.3", headers=admin_headers).json()
    hit = [c for c in clusters["similar"] + clusters["exact"] if slug in {d["slug"] for d in c["demos"]}]
    assert all(c["covered"] for c in hit) or not hit


def test_bad_challenge_task_fails_before_creating_demo(client):
    """非法题面 422，且不留孤儿 demo；candidate 题目不接受挑战。"""
    _, pending_slug = _seed_task(status="candidate")
    r = _upload(client, "错题名", task=pending_slug)
    assert r.status_code == 422, r.text

    db = _db()
    assert db.query(Demo).filter(Demo.title == "错题名").first() is None, "校验晚于建 demo → 留了孤儿"
    db.close()

    r2 = _upload(client, "不存在的题", task="no-such-task-xyz")
    assert r2.status_code == 422
    db = _db()
    assert db.query(Demo).filter(Demo.title == "不存在的题").first() is None
    db.close()


def test_no_task_means_no_suggestion(client, admin_headers):
    """不带 task 的普通上传不受影响（零行为变化）。"""
    r = _upload(client, "普通上传无挑战")
    assert r.status_code == 201, r.text
    slug = r.json()["slug"]
    db = _db()
    did = db.query(Demo.id).filter(Demo.slug == slug).first().id
    n = db.query(EntitySuggestion).filter(EntitySuggestion.demo_id == did).count()
    db.close()
    assert n == 0
