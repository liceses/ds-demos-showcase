"""后端收尾轮 P0 回归（KB-10..KB-13）。

每条都对应一个实测过的缺陷，注释写明「修之前会怎样」。
"""

import io
import json
import zipfile

import pytest
from fastapi import HTTPException

from app.models import Announcement, AuditLog, Demo


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _upload(client, headers, title, tags=("model:dsv4-flash", "type:game")):
    files = {"file": ("index.html", f"<!doctype html><body>{title}</body>".encode(), "text/html")}
    return client.post(
        "/api/v1/demos",
        headers=headers,
        data={
            "title": title,
            "description": "hardening",
            "demo_type": "web",
            "tags": json.dumps(list(tags)),
            "model_hint": "回归",
        },
        files=files,
    )


def _set_auto_approve(value: bool) -> None:
    from app.services import settings_service

    db = _db()
    try:
        settings_service.set_auto_approve(db, value)
    finally:
        db.close()


# ---------------- KB-10：未上架内容不可枚举 ----------------


def test_public_list_cannot_enumerate_unapproved(client, admin_headers, auth_headers):
    """匿名不能用 ?status= 枚举待审/已拒作品（修前 200 返回整条队列，空串更是返回全部状态）。"""
    _set_auto_approve(False)
    try:
        h, _ = auth_headers()
        up = _upload(client, h, "KB10 待审作品")
        assert up.status_code == 201 and up.json()["status"] == "pending", up.text

        assert client.get("/api/v1/demos?status=pending").status_code == 403
        assert client.get("/api/v1/demos?status=rejected").status_code == 403
        assert client.get("/api/v1/demos?status=nonsense").status_code == 422
        # 空串历史上等价于「不过滤」→ 现在按 approved 处理
        empty = client.get("/api/v1/demos?status=")
        assert empty.status_code == 200
        assert all(i["status"] == "approved" for i in empty.json()["items"])
        # admin 仍可查
        assert client.get("/api/v1/demos?status=pending", headers=admin_headers).status_code == 200
    finally:
        _set_auto_approve(True)


def test_pending_demo_does_not_leak_slug_via_announcements(client, admin_headers, auth_headers):
    """待审作品不发公开公告（修前每次上传都发公告，slug 随公告公开，预览门禁形同虚设）。"""
    _set_auto_approve(False)
    try:
        h, _ = auth_headers()
        up = _upload(client, h, "KB10 公告探针")
        slug = up.json()["slug"]
        assert up.json()["status"] == "pending"
        body = client.get("/api/v1/announcements").json()
        items = body["items"] if isinstance(body, dict) else body
        assert all(a.get("demo_slug") != slug for a in items), "待审作品 slug 出现在了公开公告里"

        # 审核通过后补发公告 + 落审计
        r = client.post(f"/api/v1/admin/review/{slug}", headers=admin_headers, json={"action": "approve"})
        assert r.status_code == 200, r.text
        body = client.get("/api/v1/announcements").json()
        items = body["items"] if isinstance(body, dict) else body
        assert any(a.get("demo_slug") == slug for a in items), "通过后应补发公告"
    finally:
        _set_auto_approve(True)


def test_review_writes_audit_and_rejects_fake_repeat(client, admin_headers, auth_headers):
    """审核落审计；同状态重复审核 409（不产生假审计行）。"""
    _set_auto_approve(False)
    try:
        h, _ = auth_headers()
        slug = _upload(client, h, "KB10 审计探针").json()["slug"]
        db = _db()
        try:
            before = db.query(AuditLog).filter(AuditLog.entity_type == "demo", AuditLog.action == "review").count()
        finally:
            db.close()
        assert client.post(f"/api/v1/admin/review/{slug}", headers=admin_headers, json={"action": "approve"}).status_code == 200
        assert client.post(f"/api/v1/admin/review/{slug}", headers=admin_headers, json={"action": "approve"}).status_code == 409
        db = _db()
        try:
            row = (
                db.query(AuditLog)
                .filter(AuditLog.entity_type == "demo", AuditLog.action == "review")
                .order_by(AuditLog.id.desc())
                .first()
            )
            after = db.query(AuditLog).filter(AuditLog.entity_type == "demo", AuditLog.action == "review").count()
        finally:
            db.close()
        assert after == before + 1, "审核没有留痕"
        assert row.before and row.after and "status" in (row.before or "")
    finally:
        _set_auto_approve(True)


# ---------------- KB-11：上传资源闸 ----------------


def test_read_limited_rejects_oversize_before_buffering(client, admin_headers, monkeypatch):
    """分块读取：超限立即 413（修前先把整个文件读进内存再判大小）。"""
    from app.config import settings

    # 单文件走 max_file_size，zip 走 max_upload_size；两个都压到 1KB
    monkeypatch.setattr(settings, "max_upload_size", 1024, raising=False)
    monkeypatch.setattr(settings, "max_file_size", 1024, raising=False)
    big = b"x" * 5000
    files = {"file": ("index.html", big, "text/html")}
    r = client.post(
        "/api/v1/demos",
        headers=admin_headers,
        data={"title": "KB11 超大文件", "demo_type": "web", "tags": '["model:dsv4-flash"]'},
        files=files,
    )
    assert r.status_code == 413, r.text


def test_extract_zip_keeps_old_files_when_new_zip_is_bad(client, admin_headers):
    """坏 zip 不再毁掉线上作品文件（修前先 rmtree 旧目录再校验新 zip）。"""
    from app.services import storage

    slug = _upload(client, admin_headers, "KB11 原子替换").json()["slug"]
    files_dir = storage.demo_files_dir(slug)
    assert (files_dir / "index.html").is_file()

    with pytest.raises(HTTPException) as e:
        storage.extract_zip(b"not a zip at all", slug, require_index=True)
    assert e.value.status_code == 400
    assert (files_dir / "index.html").is_file(), "坏 zip 把旧作品文件删掉了"

    # 缺 index.html 的合法 zip 同样不能动旧文件
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "no index here")
    with pytest.raises(HTTPException) as e2:
        storage.extract_zip(buf.getvalue(), slug, require_index=True)
    assert e2.value.status_code == 400
    assert (files_dir / "index.html").is_file()


def test_extract_zip_rejects_traversal_and_bomb(client, admin_headers, monkeypatch):
    """zip 成员越界 / 解压体积超限一律拒绝（修前越界判定用字符串前缀，体积完全不限）。"""
    from app.config import settings
    from app.services import storage

    slug = _upload(client, admin_headers, "KB11 炸弹探针").json()["slug"]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../evil.txt", "x")
        zf.writestr("index.html", "<!doctype html>ok")
    with pytest.raises(HTTPException) as e:
        storage.extract_zip(buf.getvalue(), slug, require_index=True)
    assert e.value.status_code == 400

    monkeypatch.setattr(settings, "zip_max_uncompressed", 1024, raising=False)
    buf2 = io.BytesIO()
    with zipfile.ZipFile(buf2, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", b"0" * (5 * 1024 * 1024))
    with pytest.raises(HTTPException) as e2:
        storage.extract_zip(buf2.getvalue(), slug, require_index=True)
    assert e2.value.status_code == 413


# ---------------- KB-28：压缩比口径（线上误杀正常 demo 的回归） ----------------


def _zip_of(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_normal_demo_zip_with_tiny_last_member_is_accepted(client, admin_headers):
    """线上误杀形状的回归：多文件 demo + 最后一个成员是几百字节的小文件。

    旧实现用「**累计解压量** / **当前这一个成员**的压缩量」算比值：
    每多一个成员分子就在涨、分母只算最后一个文件 —— 最后那个文件越小比值越离谱，
    正常包会被算成几千比一而误判成压缩炸弹。这条用例就是钉住「不许再这么算」。
    """
    from app.services import storage

    slug = _upload(client, admin_headers, "KB28 正常多文件包").json()["slug"]
    # 真代码风格的可压缩文本（重复度中等），末尾放一个极小的 index.html
    js = ("function render(){ return 1; }\n" * 900).encode()
    css = (".card{display:flex;gap:8px;padding:12px}\n" * 600).encode()
    html = b"<!doctype html><html><body><div id=app></div></body></html>"
    data = _zip_of({"index.html": html, "assets/app.js": js, "assets/style.css": css})

    # 先确认这个包确实会踩中旧公式（否则用例就失去意义）
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        total_uncompressed = sum(m.file_size for m in zf.infolist())
        last_compressed = max([m for m in zf.infolist() if m.filename == "index.html"][0].compress_size, 1)
        assert total_uncompressed / last_compressed > 100, "用例本身没造出旧公式的误杀条件"

    storage.extract_zip(data, slug, require_index=True)  # 不该抛


def test_bomb_zip_still_rejected_by_cumulative_ratio(client, admin_headers):
    """口径修正后，真炸弹（大体积 + 极高压缩比）仍然要拦。"""
    from app.config import settings
    from app.services import storage

    slug = _upload(client, admin_headers, "KB28 炸弹").json()["slug"]
    # 20MB 全零：压缩后约 20KB，累计比 ≈ 1000:1，且解压量远超 zip_ratio_min_bytes
    assert 20 * 1024 * 1024 > settings.zip_ratio_min_bytes
    data = _zip_of({"index.html": b"<!doctype html>ok", "payload.bin": b"\0" * (20 * 1024 * 1024)})
    with pytest.raises(HTTPException) as e:
        storage.extract_zip(data, slug, require_index=True)
    assert e.value.status_code == 413
    assert "压缩比" in str(e.value.detail)


def test_small_high_ratio_zip_skips_ratio_check(client, admin_headers, monkeypatch):
    """解压量低于下限时**不判**压缩比：小包再高也不构成磁盘威胁。"""
    from app.config import settings
    from app.services import storage

    slug = _upload(client, admin_headers, "KB28 小包高比").json()["slug"]
    monkeypatch.setattr(settings, "zip_ratio_min_bytes", 1024 * 1024, raising=False)
    monkeypatch.setattr(settings, "zip_max_ratio", 2, raising=False)  # 阈值压到 2:1
    # 100KB 可压缩文本 + 小 index.html：真实比远超 2:1，但解压量 < 1MB 下限
    data = _zip_of({"index.html": b"<!doctype html>ok", "big.txt": b"abcdefgh" * 12800})
    storage.extract_zip(data, slug, require_index=True)  # 下限生效 → 不该抛


# ---------------- KB-13：路径归属判定 ----------------


def test_media_rejects_sibling_prefix_directory(client):
    """/media 不能读到 media/ 之外的同前缀兄弟目录（修前实测 200 读到 secret）。"""
    from pathlib import Path

    from app.config import settings

    storage_root = Path(settings.storage_dir).resolve()
    evil = storage_root / "media_backup"
    evil.mkdir(parents=True, exist_ok=True)
    (evil / "secret.txt").write_text("TOP-SECRET", encoding="utf-8")
    r = client.get("/media/%2e%2e%2fmedia_backup%2fsecret.txt")
    assert r.status_code == 400, (r.status_code, r.text[:80])


def test_preview_safe_join_returns_400_instead_of_500(client, admin_headers):
    """同前缀绕过返回 400 而非未捕获的 500（修前 relative_to 抛 ValueError）。"""
    from app.config import settings
    from app.services import storage

    slug = _upload(client, admin_headers, "KB13 越界探针").json()["slug"]
    sibling = storage.demo_dir(slug) / "files_backup"
    sibling.mkdir(parents=True, exist_ok=True)
    (sibling / "secret.txt").write_text("TOP-SECRET", encoding="utf-8")
    r = client.get(f"/preview/{slug}/%2e%2e%2ffiles_backup%2fsecret.txt")
    assert r.status_code == 400, (r.status_code, r.text[:80])


# ---------------- KB-12：SSRF ----------------


def test_ssrf_guard_blocks_private_ports_and_schemes():
    """只放行 http/https + 80/443，内网/保留地址一律拒绝（修前任意端口、任意 scheme 都放行）。"""
    from app.routers.demos import _assert_public_url

    for url in (
        "http://127.0.0.1/x",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/x",
        "http://example.com:8080/x",
        "http://example.com:6379/x",
        "ftp://example.com/x",
    ):
        with pytest.raises(HTTPException):
            _assert_public_url(url)


def test_redirect_handler_revalidates_each_hop():
    """重定向逐跳复查（修前 urlopen 静默跟随 302，首跳校验形同虚设）。"""
    from app.routers.demos import _SafeRedirectHandler

    with pytest.raises(HTTPException):
        _SafeRedirectHandler().redirect_request(
            None, None, 302, "Found", {}, "http://169.254.169.254/latest/meta-data/"
        )


# ---------------- KB-15：题目域状态闸与挂题完整性 ----------------


def test_public_task_list_and_detail_hide_non_active(client, admin_headers):
    """匿名不能读 candidate/hidden/merged 题目（修前 ?status=hidden 实测 200）。"""
    cand = client.post("/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB15 候选题", "status": "candidate"})
    assert cand.status_code == 201, cand.text
    slug = cand.json()["slug"]

    assert client.get("/api/v1/tasks?status=candidate").status_code == 403
    assert client.get("/api/v1/tasks?status=hidden").status_code == 422
    assert client.get("/api/v1/tasks?status=merged").status_code == 422
    assert client.get(f"/api/v1/tasks/{slug}").status_code == 404
    # admin 仍可看
    assert client.get("/api/v1/tasks?status=candidate", headers=admin_headers).status_code == 200
    assert client.get(f"/api/v1/tasks/{slug}", headers=admin_headers).status_code == 200


def test_attach_demos_dedupes_and_rejects_merged(client, admin_headers):
    """重复 demo_id 不再 500（实测修前 500）；已合并题目拒绝挂载。"""
    up = _upload(client, admin_headers, "KB15 挂题作品")
    did = up.json()["id"]
    t = client.post("/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB15 挂题目标", "status": "active"}).json()
    t2 = client.post("/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB15 合并目标", "status": "active"}).json()

    # 同一 id 两次 + ids/slugs 指向同一作品 → 只挂一次，且不 500
    r = client.post(
        f"/api/v1/admin/tasks/{t['slug']}/demos",
        headers=admin_headers,
        json={"demo_ids": [did, did], "demo_slugs": [up.json()["slug"]]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["attached"] == 1, r.text

    # 合并后不能再挂
    db = _db()
    try:
        from app.models import Task

        dst = db.query(Task.id).filter(Task.slug == t2["slug"]).scalar()
    finally:
        db.close()
    assert client.post(
        f"/api/v1/admin/tasks/{t['slug']}/merge", headers=admin_headers, json={"target_id": dst, "dry_run": False}
    ).status_code == 200
    r2 = client.post(f"/api/v1/admin/tasks/{t['slug']}/demos", headers=admin_headers, json={"demo_ids": [did]})
    assert r2.status_code == 409, r2.text


def test_delete_task_blocked_by_reverse_merge_instead_of_500(client, admin_headers):
    """被别的题目 merged_into 指向时删题返回 409（实测修前外键抛 500）。"""
    from app.models import Task

    a = client.post("/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB15 源题", "status": "active"}).json()
    b = client.post("/api/v1/admin/tasks", headers=admin_headers, json={"title": "KB15 归宿题", "status": "active"}).json()
    db = _db()
    try:
        bid = db.query(Task.id).filter(Task.slug == b["slug"]).scalar()
    finally:
        db.close()
    assert client.post(
        f"/api/v1/admin/tasks/{a['slug']}/merge", headers=admin_headers, json={"target_id": bid, "dry_run": False}
    ).status_code == 200
    r = client.delete(f"/api/v1/admin/tasks/{b['slug']}", headers=admin_headers)
    assert r.status_code == 409, r.text


# ---------------- KB-22 / KB-23：口径与安全默认值 ----------------


def test_settings_put_does_not_reset_omitted_fields(client, admin_headers):
    """PUT /admin/settings 缺省字段不重置（修前只改 fun_mode 会把审核策略静默重置），并落审计。"""
    r0 = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"auto_approve": False, "auto_approve_public": False},
    )
    assert r0.status_code == 200, r0.text
    r1 = client.put("/api/v1/admin/settings", headers=admin_headers, json={"fun_mode": True})
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body["auto_approve"] is False, "缺省字段被静默重置了"
    assert body["auto_approve_public"] is False
    assert body["fun_mode"] is True
    # 空补丁 422（不产生假审计）
    assert client.put("/api/v1/admin/settings", headers=admin_headers, json={}).status_code == 422

    db = _db()
    try:
        row = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "setting")
            .order_by(AuditLog.id.desc())
            .first()
        )
    finally:
        db.close()
    assert row is not None and row.before and row.after, "设置变更没有留痕"
    # 复位
    client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"auto_approve": True, "auto_approve_public": False, "fun_mode": False},
    )


def test_inbox_kind_filter_accepts_retag_demo(client, admin_headers):
    """收件箱 kind 白名单由常量生成（修前漏 retag_demo，实测 422）。"""
    r = client.get("/api/v1/admin/suggestions?kind=retag_demo", headers=admin_headers)
    assert r.status_code == 200, r.text


def test_user_patch_accepts_banned_status(client, admin_headers, auth_headers):
    """PATCH /users/{id} 接受 banned（修前 422，封禁态无法表达）。"""
    _, name = auth_headers()
    db = _db()
    try:
        from app.models import User

        uid = db.query(User.id).filter(User.username == name).scalar()
    finally:
        db.close()
    r = client.patch(f"/api/v1/users/{uid}", headers=admin_headers, json={"status": "banned"})
    assert r.status_code == 200, r.text
    # 复位，避免影响后续用例
    client.patch(f"/api/v1/users/{uid}", headers=admin_headers, json={"status": "active"})


def test_validation_error_keeps_contract_code(client):
    """参数校验失败也遵守 {detail, code} 契约（修前只有 detail，缺 code）。"""
    r = client.get("/api/v1/demos?page_size=999")
    assert r.status_code == 422
    assert r.json().get("code") == "http_422", r.text


def test_health_reports_default_secret_warnings(client):
    """默认密钥/口令告警随 /health 返回（KB-23）。"""
    body = client.get("/api/v1/health").json()
    assert "warnings" in body and isinstance(body["warnings"], list)
