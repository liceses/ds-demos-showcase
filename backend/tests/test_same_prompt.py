"""v2 B2′：同提示词模块（prompt_id 精确匹配 + 未回填时的文本兜底 + astra 默认拒绝）。"""

import json
import os

from fastapi.testclient import TestClient

from app.main import app


def _upload(client, title, prompt="", tags=None):
    data = {"title": title, "description": "同提示词测试", "demo_type": "web", "prompt": prompt}
    # Q2 起 model 标签必填：不显式给就走兜底值，保持本文件聚焦「同提示词」语义
    data["tags"] = json.dumps(tags or ["model:unspecified", "type:effect"], ensure_ascii=False)
    files = {"file": ("index.html", f"<!doctype html><body>{os.urandom(8).hex()}</body>".encode(), "text/html")}
    r = client.post("/api/v1/demos", data=data, files=files)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def test_same_prompt_groups_across_models(client):
    """同一句提示词、不同模型：互相出现在对方的「同提示词」里（v2 的核心对比视角）。"""
    prompt = "做一个 canvas 粒子星空，鼠标移动产生引力扰动"
    a = _upload(client, "同提示词A", prompt=prompt, tags=["model:dsv4-flash", "type:effect"])
    b = _upload(client, "同提示词B", prompt=prompt, tags=["model:dsv4-pro", "type:effect"])
    other = _upload(client, "别的提示词", prompt="做一个完全不同的霓虹时钟")

    ra = client.get(f"/api/v1/demos/{a}/same-prompt").json()
    assert ra["prompt"] == prompt
    slugs = {d["slug"] for d in ra["items"]}
    assert b in slugs, f"同提示词作品未出现：{slugs}"
    assert other not in slugs
    assert a not in slugs, "不应把自己算进同提示词"

    # v2 序列化字段随行返回（前端可直接渲染模型 chips）
    row = next(d for d in ra["items"] if d["slug"] == b)
    assert {m["name"] for m in row["models"]} == {"dsv4-pro"}

    # 反向对称
    rb = client.get(f"/api/v1/demos/{b}/same-prompt").json()
    assert a in {d["slug"] for d in rb["items"]}


def test_no_prompt_returns_empty(client):
    slug = _upload(client, "无提示词作品", prompt="")
    body = client.get(f"/api/v1/demos/{slug}/same-prompt").json()
    assert body["items"] == []
    assert body["prompt"] == ""
    assert body["prompt_id"] is None


def test_same_prompt_respects_unpublished(client):
    """未上架（pending/rejected）的作品不得出现在同提示词结果里。"""
    from app.database import SessionLocal
    from app.models import Demo

    prompt = "只在已上架之间互见的提示词"
    a = _upload(client, "互见A", prompt=prompt)
    b = _upload(client, "互见B", prompt=prompt)

    db = SessionLocal()
    d = db.query(Demo).filter(Demo.slug == b).first()
    d.status = "pending"
    db.commit()
    db.close()

    items = client.get(f"/api/v1/demos/{a}/same-prompt").json()["items"]
    assert b not in {x["slug"] for x in items}


def test_astra_denies_same_prompt_subroute(client):
    """白名单制：新增子路由默认不对 astra 橱窗开放。"""
    slug = _upload(client, "橱窗外可见性", prompt="astra 不该看到这个提示词")
    with TestClient(app, base_url="http://astrademos.top") as astra:
        assert astra.get(f"/api/v1/demos/{slug}/same-prompt").status_code == 404
    # deep 域正常
    assert client.get(f"/api/v1/demos/{slug}/same-prompt").status_code == 200
