"""迁移脚本对脏数据的鲁棒性：同一件作品挂两种写法的模型标签。

真实 prod 语料踩到的崩溃：`dsv4-flash` 与 `DSV4-Flash` 两个标签值经 normalize
落到同一个 Model 实体，旧版脚本按标签值遍历会把同一 (demo, model) 插两遍，
等到任何 flush 才炸 UNIQUE —— 且 SessionLocal 是 autoflush=False，
"先查库再插入"的防重查询看不到本运行中未提交的新增行。

命名 test_zz_* + admin 上传（两点都是刻意的，勿"顺手改掉"）：
- 本文件会真实跑迁移 main()，其 step① 为**整张 model 词表**建实体（含种子词表的
  ds-unknown）、step⑤ 可能生成合并候选 —— 套件共享同一测试库（session 级 client），
  必须排在所有断言「实体尚不存在 / 绝对计数」的用例之后；
- 匿名上传有进程内 20 篇/小时限流（_anon_uploads 整个套件共享计数器），这里用
  admin 身份上传，避免多耗 2 个配额把后面的用例打成 429。
"""

import importlib.util
import os
import sys

from app.models import Demo, DemoModel, Model, Tag


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload_two_spellings(client, headers):
    """一件作品同时挂 `mig-a` 与 `MIG-A` 两种写法（都先入词表）。

    admin 身份上传（理由见模块 docstring）；文件内容带随机标记：上传按
    （作者, 内容哈希）去重，两次调用内容必须不同，否则后续用例 409。
    """
    from app.services import model_service

    marker = os.urandom(4).hex()
    db = _db()
    try:
        for v in ("mig-a", "MIG-A"):
            model_service.ensure_tag_value(db, v)
        db.commit()
    finally:
        db.close()

    data = {
        "title": "迁移脏数据用例",
        "description": "同一作品两种写法",
        "demo_type": "web",
        "tags": '["model:mig-a", "model:MIG-A", "type:game"]',
    }
    files = {
        "file": (
            "index.html",
            f"<!doctype html><html><body>x-{marker}</body></html>".encode("utf-8"),
            "text/html",
        )
    }
    r = client.post("/api/v1/demos", data=data, files=files, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["slug"]


def _load_migration(monkeypatch):
    """从文件加载迁移脚本（scripts/ 不是包），argv 指向自身。"""
    script = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "migrate_models_v2.py"))
    spec = importlib.util.spec_from_file_location("migrate_models_v2", script)
    mod = importlib.util.module_from_spec(spec)
    monkeypatch.setattr(sys, "argv", ["migrate_models_v2.py"])
    spec.loader.exec_module(mod)
    return mod


def test_migration_dedupes_variant_links(client, admin_headers, monkeypatch):
    slug = _upload_two_spellings(client, admin_headers)
    mod = _load_migration(monkeypatch)
    # 幂等：旧版在这里抛 UNIQUE constraint failed: demo_models.demo_id/model_id
    mod.main()

    db = _db()
    try:
        d = db.query(Demo).filter(Demo.slug == slug).first()
        links = db.query(DemoModel).filter(DemoModel.demo_id == d.id).all()
        # 两种写法归并为同一个实体 → 只能有**一条**链接
        assert len(links) == 1, f"重复链接：{len(links)} 条"
        # 实体本身存在（名字是先创建的那个写法）
        assert db.query(Model).filter(Model.slug == "mig-a").first() is not None
        # 词表里两个值都在（词表是事实源，合并是人工决定）
        assert db.query(Tag).filter(Tag.key == "model", Tag.value == "MIG-A").first() is not None
    finally:
        db.close()


def test_migration_is_idempotent_on_rerun(client, admin_headers, monkeypatch):
    """跑两遍：第二遍不应新增链接、不应崩溃（幂等承诺）。"""
    _upload_two_spellings(client, admin_headers)
    mod = _load_migration(monkeypatch)
    mod.main()
    db = _db()
    try:
        n1 = db.query(DemoModel).count()
    finally:
        db.close()
    mod.main()
    db = _db()
    try:
        n2 = db.query(DemoModel).count()
    finally:
        db.close()
    assert n2 == n1, f"重跑后链接数变了：{n1} → {n2}"