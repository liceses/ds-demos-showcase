"""题目行代表封面 + 200px 缩略图管线（探索页第 4 轮）的后端契约测试。

为什么这几条值得单独钉住：
  · 「代表封面」的排序口径必须与 `task_chain()` **同源** —— 分叉了读者就会看到
    "列表封面是 A、点进去链条第一行是 B"，比没有封面更糟；
  · 没有缩略图的作品必须被**跳过**而不是拿 default.svg 顶上（假封面比空着更差）；
  · `save_cover` 现在返回二元组：两个文件必须一起落盘，漏一个就静默少图（无异常、无日志）。

复用 conftest 的 session 级 client（临时 SQLite + AUTO_APPROVE=true）。
"""

from __future__ import annotations

import io
from pathlib import Path
import json
import os

from PIL import Image

from app.config import settings
from app.database import SessionLocal
from app.models import Demo, DemoTask, Task
from app.services import storage, task_service


def _png(w: int = 1200, h: int = 800, color: tuple[int, int, int] = (90, 140, 210)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


def _webp(w: int = 1280, h: int = 800) -> bytes:
    """走真实压缩路径拿一份封面（save_cover 与回填脚本的入参形态就是它）。"""
    data, ext = storage.compress_cover(_png(w, h))
    assert ext == "webp"
    return data


def _covers_dir():
    return settings.media_path / "covers"


def _name_of(url: str) -> str:
    return url[len(storage.COVER_URL_PREFIX) :]


# ---------- 1. 命名规则（唯一定义处） ----------


def test_cover_thumb_url_rules():
    assert storage.cover_thumb_url("/media/covers/abc123.webp") == "/media/covers/abc123-thumb.webp"
    # 已经是缩略图 → 原样返回（规则幂等，回填脚本重复应用不叠后缀）
    assert storage.cover_thumb_url("/media/covers/abc123-thumb.webp") == "/media/covers/abc123-thumb.webp"
    # 以下都表示"没有缩略图"：SVG 无法栅格化 / 历史非 webp / 外链 / 空 / 越界路径
    assert storage.cover_thumb_url("/media/covers/default.svg") == ""
    assert storage.cover_thumb_url("/media/covers/legacy.png") == ""
    assert storage.cover_thumb_url("https://cdn.example.com/abc.webp") == ""
    assert storage.cover_thumb_url("") == ""
    assert storage.cover_thumb_url("/media/covers/../abc.webp") == ""


# ---------- 2. 生成：尺寸上限 + 幂等 + 不放大 ----------


def test_make_cover_thumb_size_and_idempotent():
    src = _webp(1280, 800)
    a = storage.make_cover_thumb(src)
    b = storage.make_cover_thumb(src)
    assert a == b, "同一输入必须产出同一字节（回填脚本重跑不该产生新内容）"

    img = Image.open(io.BytesIO(a))
    assert img.format == "WEBP"
    assert max(img.size) <= storage.COVER_THUMB_MAX_SIDE
    # 等比：1280×800 → 200×125
    assert img.size == (200, 125)

    # 小图只缩不放（120×90 原样保留，不糊大）
    small = storage.make_cover_thumb(_webp(120, 90))
    assert Image.open(io.BytesIO(small)).size == (120, 90)


# ---------- 3. 写入：两个文件一起落盘 ----------


def test_save_cover_writes_both_files():
    # 三元组：封面 + 200 缩略图 + 640 卡片图（三个文件必须一起落盘）
    cover_url, thumb_url, card_url = storage.save_cover(_png(1600, 900), "png")
    assert cover_url.startswith("/media/covers/") and cover_url.endswith(".webp")
    assert thumb_url == f"{cover_url[:-5]}-thumb.webp"
    assert card_url == f"{cover_url[:-5]}-card.webp"
    assert (_covers_dir() / _name_of(card_url)).is_file(), "640 卡片图没落盘"
    # 档位像素：200 / 640（只缩不放）
    assert max(Image.open(_covers_dir() / _name_of(thumb_url)).size) <= storage.COVER_THUMB_MAX_SIDE
    assert max(Image.open(_covers_dir() / _name_of(card_url)).size) <= storage.COVER_CARD_MAX_SIDE
    assert max(Image.open(_covers_dir() / _name_of(card_url)).size) > storage.COVER_THUMB_MAX_SIDE
    assert (_covers_dir() / _name_of(cover_url)).is_file()
    assert (_covers_dir() / _name_of(thumb_url)).is_file()
    assert max(Image.open(_covers_dir() / _name_of(thumb_url)).size) <= storage.COVER_THUMB_MAX_SIDE

    # SVG 分支没有小图（两个档都是 ""，前端据此不渲染图片）
    _, svg_thumb, svg_card = storage.save_cover(b"<svg xmlns='http://www.w3.org/2000/svg'/>", "svg")
    assert svg_thumb == ""
    assert svg_card == ""


# ---------- 4. HTTP 路径：上传带封面 → 两个字段都被写入 ----------


def test_upload_with_cover_fills_thumb_column(client):
    token = os.urandom(4).hex()
    html = f"<html><body>cover-{token}</body></html>".encode()
    r = client.post(
        "/api/v1/demos",
        data={"title": f"封面测试 {token}", "description": "d", "demo_type": "web",
              "tags": json.dumps(["model:unspecified"])},
        files={
            "file": ("index.html", io.BytesIO(html), "text/html"),
            "cover": ("c.png", io.BytesIO(_png(1400, 900)), "image/png"),
        },
    )
    assert r.status_code in (200, 201), r.text
    slug = r.json()["slug"]

    db = SessionLocal()
    try:
        demo = db.query(Demo).filter(Demo.slug == slug).first()
        assert demo is not None
        assert demo.cover_url.endswith(".webp"), demo.cover_url
        assert demo.cover_thumb_url == f"{demo.cover_url[:-5]}-thumb.webp", demo.cover_thumb_url
        assert (_covers_dir() / _name_of(demo.cover_thumb_url)).is_file()
    finally:
        db.close()


def test_upload_without_cover_has_no_thumb(client):
    token = os.urandom(4).hex()
    html = f"<html><body>nocover-{token}</body></html>".encode()
    r = client.post(
        "/api/v1/demos",
        data={"title": f"无封面测试 {token}", "description": "d", "demo_type": "web",
              "tags": json.dumps(["model:unspecified"])},
        files={"file": ("index.html", io.BytesIO(html), "text/html")},
    )
    assert r.status_code in (200, 201), r.text
    slug = r.json()["slug"]

    db = SessionLocal()
    try:
        demo = db.query(Demo).filter(Demo.slug == slug).first()
        assert demo.cover_url.endswith("default.svg")
        assert demo.cover_thumb_url == ""  # 占位图不是封面：列表页不渲染，不留空洞
    finally:
        db.close()


# ---------- 5. 代表封面：排序口径 + 跳过无缩略图 ----------


def _seed_task(title: str, specs: list[dict]) -> int:
    """建一道题 + 若干作品（specs: rating_avg/rating_count/cover_thumb_url/status）。"""
    db = SessionLocal()
    try:
        task = Task(slug=f"cov-{os.urandom(4).hex()}", title=title, description="", status="active")
        db.add(task)
        db.flush()
        for i, s in enumerate(specs):
            thumb = s.get("cover_thumb_url", "")
            demo = Demo(
                slug=f"covd-{os.urandom(4).hex()}",
                title=f"{title}-{i}",
                description="",
                status=s.get("status", "approved"),
                cover_url=thumb.replace("-thumb", "") or "/media/covers/default.svg",
                cover_thumb_url=thumb,
                rating_avg=s.get("rating_avg", 0.0),
                rating_count=s.get("rating_count", 0),
                view_count=s.get("view_count", 0),
            )
            db.add(demo)
            db.flush()  # 拿自增 id 才能建挂载关系（复合主键）
            db.add(DemoTask(demo_id=demo.id, task_id=task.id))
        db.commit()
        return task.id
    finally:
        db.close()


def test_representative_covers_picks_best_with_thumb():
    t_has = _seed_task(
        "封面口径题",
        [
            # 最高分但**没有**缩略图 → 必须跳过（不许拿 default.svg 冒充封面）
            {"rating_avg": 5.0, "rating_count": 10, "cover_thumb_url": ""},
            # 同分：票数多的赢（与 task_chain 的第二排序键一致）
            {"rating_avg": 4.0, "rating_count": 5, "cover_thumb_url": "/media/covers/low.webp"},
            {"rating_avg": 4.0, "rating_count": 9, "cover_thumb_url": "/media/covers/win.webp"},
            # 未上架、分更高 → 不参与
            {"rating_avg": 5.0, "rating_count": 30, "cover_thumb_url": "/media/covers/pending.webp",
             "status": "pending"},
        ],
    )
    t_none = _seed_task("全无封面题", [{"rating_avg": 5.0, "rating_count": 2, "cover_thumb_url": ""}])

    db = SessionLocal()
    try:
        got = task_service.representative_covers(db, [t_has, t_none, 0])
    finally:
        db.close()

    assert got[t_has] == "/media/covers/win.webp", got
    assert t_none not in got, "一道题都没有可用封面时不该出现在结果里（前端据此不渲染图片）"
    assert 0 not in got


# ---------- 6. 接口暴露：/tasks 与 /explore 都带该字段 ----------


def test_task_list_exposes_cover_thumb_url(client):
    token = os.urandom(4).hex()
    title = f"封面接口题-{token}"
    t_id = _seed_task(title, [
        {"rating_avg": 4.5, "rating_count": 3, "cover_thumb_url": f"/media/covers/{token}.webp"},
    ])
    assert t_id

    r = client.get("/api/v1/tasks", params={"q": title})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1, items
    assert items[0]["cover_thumb_url"] == f"/media/covers/{token}.webp"
    assert isinstance(items[0]["cover_thumb_url"], str)  # 空值是 "" 而不是 null（前端 v-if 才好写）

    # /explore：字段必须存在且类型稳定（该题不一定进 Top8 —— 全站累计数据决定名次，
    # 所以这里只断言形状；取值路径已由上面的 /tasks 精确断言覆盖）
    e = client.get("/api/v1/explore")
    assert e.status_code == 200, e.text
    for tk in e.json()["tasks"]:
        assert "cover_thumb_url" in tk
        assert isinstance(tk["cover_thumb_url"], str)


# ---------- 8. 与前端共用同一份用例（规则不许分叉） ----------


def test_cover_url_cases_match_frontend_fixture():
    """前端 utils/coverUrl.ts 与后端 storage.cover_sized_url() 必须满足同一份用例。

    两侧各有一套实现（前端要能在 v-html 拼串与本机历史里推导 URL，后端要在写入与回填时派生文件名），
    规则一旦分叉就会出现"列表 404 但详情正常"这种最难查的错 —— 所以用例只有一份。
    """
    fixture_path = Path(__file__).resolve().parents[2] / "frontend" / "tests" / "fixtures" / "cover-url-cases.json"
    if not fixture_path.is_file():  # 后端单独 checkout 时不硬失败
        return
    data = json.loads(fixture_path.read_text(encoding="utf-8"))
    bad = []
    for case in data["cases"]:
        for tier in ("thumb", "card"):
            got = storage.cover_sized_url(case["url"], tier)
            if got != case[tier]:
                bad.append(f'{case["url"]} {tier}: 期望 {case[tier]!r} 实得 {got!r}（{case["why"]}）')
    assert not bad, "与前端用例不一致：\n" + "\n".join(bad)


def test_cover_card_tier_size_and_idempotent():
    src = _webp(1280, 800)
    a = storage.make_cover_card(src)
    b = storage.make_cover_card(src)
    assert a == b, "同一输入必须产出同一字节"
    assert Image.open(io.BytesIO(a)).size == (640, 400)
    # 只缩不放：小图原样
    assert Image.open(io.BytesIO(storage.make_cover_card(_webp(300, 200)))).size == (300, 200)
    # 未知档位 → ""（调用方回落到原图）
    assert storage.cover_sized_url("/media/covers/a.webp", "nope") == ""
    # 跨档幂等：已经是 -thumb 的要 -card → ""（不许在 -thumb 上再叠后缀）
    assert storage.cover_card_url("/media/covers/a-thumb.webp") == ""
    assert storage.cover_thumb_url("/media/covers/a-card.webp") == ""
