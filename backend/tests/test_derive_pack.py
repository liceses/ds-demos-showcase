"""§4.2 标签建议包：匿名可用、只建议不写库、边界不误伤。

两条刻意锁住的边界：
- 短 ASCII 值必须按词边界命中（`mc` 不该从 "mcdonald" 里跳出来）；
- 垃圾桶/兜底值不进建议包（推 `type:demo` 等于帮倒忙）。
"""

from app.models import Tag


def _db():
    from app.database import SessionLocal

    return SessionLocal()


def _ensure_game_value():
    db = _db()
    try:
        if db.query(Tag).filter(Tag.key == "game", Tag.value == "mc").first() is None:
            db.add(Tag(key="game", value="mc", description="我的世界"))
            db.commit()
    finally:
        db.close()


def test_derive_is_anonymous_and_returns_pack(client):
    _ensure_game_value()
    r = client.post(
        "/api/v1/tags/derive",
        json={
            "title": "钢琴节奏小游戏",
            "description": "用 dsv4-flash 做的我的世界风格场景，带物理仿真",
            "prompt": "做一个可玩的音乐节奏游戏",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    pairs = {(i["key"], i["value"]) for i in body["items"]}
    assert ("type", "music") in pairs, pairs  # 关键词引擎（不是旧的 game 硬编码）
    assert ("model", "dsv4-flash") in pairs, pairs
    assert ("game", "mc") in pairs, pairs  # 靠「我的世界」这条中文介绍命中，值本身没出现
    assert all(i["reason"] for i in body["items"]), "建议必须自带依据，否则人无法判断"


def test_derive_rejects_short_and_garbage_input(client):
    assert client.post("/api/v1/tags/derive", json={"title": "ab"}).json()["items"] == []
    r = client.post("/api/v1/tags/derive", json={"title": "一个完全对不上任何词表的黑话作品", "description": "", "prompt": ""})
    assert r.status_code == 200
    assert isinstance(r.json()["items"], list)


def test_derive_never_suggests_garbage_values(client):
    r = client.post(
        "/api/v1/tags/derive",
        json={"title": "综合演示", "description": "这是一个 demo 展示", "prompt": "随便做点什么"},
    )
    pairs = {(i["key"], i["value"]) for i in r.json()["items"]}
    assert ("type", "demo") not in pairs, pairs
    assert not any(v == "unspecified" for _, v in pairs), pairs


def test_short_ascii_value_does_not_match_inside_a_word(client):
    """`mc` 不能从 "mcdonald" 里命中 —— 否则建议包会被误收，比不推更糟。"""
    _ensure_game_value()
    r = client.post("/api/v1/tags/derive", json={"title": "McDonald 订单面板", "description": "点餐与订单管理工具", "prompt": ""})
    pairs = {(i["key"], i["value"]) for i in r.json()["items"]}
    assert ("game", "mc") not in pairs, pairs


def test_admin_ai_suggest_shares_the_engine(client, admin_headers):
    """旧端点必须与新引擎同源：同一文本给出同一个 type 值。"""
    text = "钢琴节奏小游戏，用 dsv4-flash 生成，带物理仿真"
    pub = client.post("/api/v1/tags/derive", json={"title": text}).json()["items"]
    adm = client.post("/api/v1/tags/admin/ai-suggest", json={"text": text}, headers=admin_headers).json()["suggestions"]
    pub_type = [i["value"] for i in pub if i["key"] == "type"]
    adm_type = [s["value"] for s in adm if s["key"] == "type"]
    assert pub_type and pub_type == adm_type, (pub_type, adm_type)
    assert all({"key", "value", "reason"} <= set(s) for s in adm), "旧端点响应形态要向后兼容"


def test_admin_ai_suggest_still_requires_admin(client):
    client.cookies.clear()
    assert client.post("/api/v1/tags/admin/ai-suggest", json={"text": "音乐游戏"}).status_code == 401
