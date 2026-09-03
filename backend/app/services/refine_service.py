"""type:demo 拆分流水线（B4 规则版，落地计划 §4.3 的第 1 项）。

`type:demo`（综合演示）一个值吞了 46% 的作品 —— 它不是分类，是垃圾桶。
本模块用纯规则把它拆成真实归属：从提示词 / 标题 / 描述 / 已有 category·game 标签
推导更精确的 type 值，产出 `retag_demo` 候选交人工批量确认。

三条守住的规矩：
1. **只出候选，不自动改**（四层治理：规则 → 算法 → LLM → 人工；这里是规则层，人是最后一道）；
2. **只碰 `type` 键**：type 不是实体，不涉及 model/task 双写，风险面最小；
3. 规则命中不到就**如实说命中不到**（返回空），绝不硬塞一个值把垃圾抽屉换个名字继续装。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, DemoTag, Tag, TagKey

# 现有一级 type（fixed 种子）
EXISTING_TYPE_VALUES = {"effect", "widget", "game", "demo"}

# 细分规则：目标值 → (中文关键词, 英文关键词)。英文词用词边界匹配，避免 game 命中 "username"。
TYPE_RULES: dict[str, tuple[tuple[str, ...], tuple[str, ...] ]] = {
    "simulation": (("仿真", "模拟", "物理", "弹道", "轨道", "引力", "流体", "碰撞"), ("simulate", "simulation", "physics", "orbit", "gravity")),
    "visualization": (("可视化", "图表", "分布图", "拓扑", "三维展示", "点云", "热力图"), ("visualiz", "chart", "graph", "plot", "dashboard")),
    "education": (("教学", "教育", "课程", "学习", "科普", "入门", "讲解", "实验课"), ("tutorial", "learn", "course", "quiz")),
    "music": (("音乐", "音频", "节奏", "钢琴", "合成器", "鼓机", "声波"), ("music", "audio", "piano", "synth", "drum", "beat")),
    "art": (("绘画", "美术", "像素", "涂色", "调色", "生成艺术", "图案", "字体"), ("pixel", "art", "draw", "paint", "palette", "shader")),
    "puzzle": (("解谜", "拼图", "数独", "推箱子", "找不同", "消消乐"), ("puzzle", "sudoku", "match-?3", "2048")),
    "strategy": (("策略", "塔防", "经营", "布阵", "回合"), ("tower defense", "strategy", "roguelike", "civilization")),
    "action": (("动作", "射击", "格斗", "跑酷", "跳跃", "闪避"), ("shooter", "platformer", "runner", "fight")),
    "card": (("卡牌", "牌局", "斗地主", "扑克", "麻将"), ("card", "poker", "mahjong", "blackjack")),
    "story": (("剧情", "叙事", "对话树", "文字冒险", "小说", "角色扮"), ("story", "visual novel", "interactive fiction", "rpg")),
    "utility": (("工具", "转换", "计算", "剪贴", "格式", "编码", "二维码", "倒计时", "秒表"), ("converter", "calculator", "codec", "qrcode", "timer", "stopwatch", "clipboard")),
    "chat": (("对话", "聊天", "机器人", "客服", "陪伴"), ("chat", "chatbot", "assistant", "companion")),
    "benchmark": (("测评", "跑分", "基准", "对比测试", "打分"), ("benchmark", "leaderboard", "score board")),
    "spatial": (("魔方", "迷宫", "立体", "体素", "结构", "搭建"), ("rubik", "maze", "voxel")),
}

# 已有 category / game 标签能佐证到的目标值（弱信号，置信更低）
CATEGORY_HINTS: dict[str, tuple[str, ...]] = {
    "simulation": ("仿真", "物理", "3d"),
    "education": ("教育", "学习", "科普"),
    "music": ("音乐", "音频"),
    "utility": ("工具", "效率"),
    "visualization": ("数据", "可视化", "图表"),
    "benchmark": ("测评", "对比"),
}

@dataclass
class Proposal:
    demo_id: int
    slug: str
    title: str
    add: str  # 建议换成的 type 值
    alt: list[str] = field(default_factory=list)  # 次优建议（供人参考，不自动应用）
    confidence: float = 0.0
    matched: list[str] = field(default_factory=list)  # 命中的关键词（可解释性）
    reason: str = ""

    def to_payload(self) -> dict:
        return {
            "demo_id": self.demo_id,
            "demo_slug": self.slug,
            "demo_title": self.title,
            "remove": "demo",
            "add": self.add,
            "alt": self.alt,
            "matched": self.matched,
            "reason": self.reason,
        }


def _ascii_hits(text: str, words: tuple[str, ...]) -> list[str]:
    """英文词按词前缀匹配（visualiz 覆盖 visualize/visualização），避免裸 substring 误命中。"""
    found = []
    for w in words:
        if re.search(r"(?<![a-z0-9])" + re.escape(w), text):
            found.append(w)
    return found


def classify(texts: dict[str, str], tags: dict[str, list[str]]) -> list[dict]:
    """对单件作品跑规则，返回按置信度排序的建议（可能为空 —— 命中不到就如实空）。

    返回元素是 dict（target/confidence/matched/weak），不是 Proposal：Proposal 是
    落库形态（带 demo 身份），这里是纯函数便于单测与 LLM 层复用。

    texts: {"prompt":..., "title":..., "description":...}（不同字段权重不同）
    tags:  该作品已有的键值集合，用于 category/game 弱佐证
    """
    scores: dict[str, list[tuple[float, str]]] = {}  # 目标值 → [(权重, 命中词)]

    def add_hit(target: str, weight: float, word: str) -> None:
        scores.setdefault(target, []).append((weight, word))

    field_weights = {"prompt": 1.0, "title": 0.9, "description": 0.7}
    for field_name, weight in field_weights.items():
        raw = (texts.get(field_name) or "").strip()
        if not raw:
            continue
        low = raw.lower()
        for target, (zh, en) in TYPE_RULES.items():
            for w in zh:
                if w in raw:
                    add_hit(target, weight, w)
            for w in _ascii_hits(low, en):
                add_hit(target, weight, w)

    # 弱佐证：category/game 标签命中（不单独成案，只给已有命中加权/兜底）
    weak: dict[str, list[str]] = {}
    for key in ("category", "game"):
        for v in tags.get(key, []):
            for target, hints in CATEGORY_HINTS.items():
                if any(h in v for h in hints):
                    weak.setdefault(target, []).append(f"{key}:{v}")

    out: list[Proposal] = []
    for target, hits in scores.items():
        if target in EXISTING_TYPE_VALUES - {"demo"}:
            continue  # 这些本来就是有效 type，不算拆分产物
        words = sorted({w for _, w in hits})
        best = max(w for w, _ in hits) if hits else 0.0
        # 置信度：强字段多词命中 → 0.85；单命中 → 0.72；有标签佐证 → +0.06
        conf = 0.72 if best < 0.8 else 0.85
        if target in weak:
            conf += 0.06
        if len(words) >= 2:
            conf += 0.04
        out.append(
            {
                "target": target,
                "confidence": round(min(conf, 0.9), 2),
                "matched": words + weak.get(target, []),
                "weak": weak.get(target, []),
            }
        )
    out.sort(key=lambda x: -x["confidence"])
    return out


def proposals_for_demo(db: Session, demo: Demo) -> list[dict]:
    tags: dict[str, list[str]] = {}
    for link in demo.tag_associations:
        tags.setdefault(link.tag.key, []).append(link.tag.value)
    cands = classify(
        {"prompt": demo.prompt or "", "title": demo.title or "", "description": demo.description or ""},
        tags,
    )
    return cands


def demo_type_values(db: Session, demo: Demo) -> list[str]:
    return [l.tag.value for l in demo.tag_associations if l.tag.key == "type"]


def scan(
    db: Session,
    *,
    limit: int = 500,
    min_confidence: float = 0.6,
) -> list[Proposal]:
    """扫描挂着 `type:demo` 的已上架作品，产出细分建议（**不落库**，纯预览）。"""
    demos = (
        db.query(Demo)
        .join(DemoTag, DemoTag.demo_id == Demo.id)
        .join(Tag, Tag.id == DemoTag.tag_id)
        .filter(Demo.status == "approved", Tag.key == "type", Tag.value == "demo")
        .order_by(Demo.created_at.desc())
        .limit(limit)
        .all()
    )
    out: list[Proposal] = []
    for d in demos:
        cands = proposals_for_demo(db, d)
        if not cands:
            continue
        top = cands[0]
        if top["confidence"] < min_confidence:
            continue
        out.append(
            Proposal(
                demo_id=d.id,
                slug=d.slug,
                title=d.title,
                add=top["target"],
                alt=[c["target"] for c in cands[1:3]],
                confidence=top["confidence"],
                matched=top["matched"],
                reason=f"type:demo 命中 {len(top['matched'])} 个关键词：" + "、".join(top["matched"][:5]),
            )
        )
    return out


def stats(db: Session) -> dict:
    """当前 type 值分布 + type:demo 体量（体检与流水线效果对照）。"""
    rows = (
        db.query(Tag.value, func.count(func.distinct(DemoTag.demo_id)))
        .join(DemoTag, DemoTag.tag_id == Tag.id)
        .join(Demo, Demo.id == DemoTag.demo_id)
        .filter(Tag.key == "type", Demo.status == "approved")
        .group_by(Tag.value)
        .order_by(func.count(func.distinct(DemoTag.demo_id)).desc())
        .all()
    )
    approved = db.query(func.count(Demo.id)).filter(Demo.status == "approved").scalar() or 0
    dist = [{"value": v, "demos": n, "rate": round(n / approved, 3) if approved else 0.0} for v, n in rows]
    return {"approved": approved, "type_dist": dist, "demo_share": dist[0]["rate"] if dist and dist[0]["value"] == "demo" else 0.0}


def ensure_type_value(db: Session, value: str, label_zh: str = "") -> Tag:
    """确保 `type:<value>` 固定值在词表里（不存在则建 —— 由管理员批准候选这一步授权）。"""
    if db.get(TagKey, "type") is None:
        db.add(TagKey(key="type", mode="fixed", label="类型", description="Demo 类型（固定值）", sort=3, tier=2))
        db.flush()
    tag = db.query(Tag).filter(Tag.key == "type", Tag.value == value).first()
    if tag is None:
        tag = Tag(key="type", value=value, description=label_zh or value)
        db.add(tag)
        db.flush()
    return tag


def apply_retag(db: Session, demo: Demo, add_value: str, *, remove_value: str | list[str] | None = "demo") -> dict:
    """执行一条 retag 建议：换掉 / 补上 `type` 键的值（其余键一律不动）。

    三种用法共用一个入口：
      - 拆分垃圾桶：`add='simulation', remove='demo'`
      - 纯补值（巡检发现压根没有 type）：`add='music', remove=''`
      - 多值收敛：`add='game', remove=['demo']`（保留更具体的那个）

    幂等：目标已在位且无该删的 → `changed=False`。绝不删掉 `add_value` 自己。
    """
    add_tag = ensure_type_value(db, add_value)
    removes = [remove_value] if isinstance(remove_value, str) else list(remove_value or [])
    removes = [r for r in removes if r and r != add_value]
    current = {l.tag.value: l for l in demo.tag_associations if l.tag.key == "type"}
    changed = False
    if add_value not in current:
        db.add(DemoTag(demo_id=demo.id, tag_id=add_tag.id))
        changed = True
    for r in removes:
        if r in current:
            db.delete(current[r])
            changed = True
    if changed:
        db.flush()
        from . import cluster_service

        cluster_service.invalidate()
    return {
        "changed": changed,
        "type_values": sorted({t for t in current if t not in removes} | {add_value}),
    }


LABELS_ZH = {
    "simulation": "仿真模拟类",
    "visualization": "可视化类",
    "education": "教育科普类",
    "music": "音乐音频类",
    "art": "美术创作类",
    "puzzle": "益智解谜类",
    "strategy": "策略类",
    "action": "动作类",
    "card": "卡牌类",
    "story": "剧情叙事类",
    "utility": "实用工具类",
    "chat": "对话陪伴类",
    "benchmark": "测评类",
    "spatial": "空间结构类",
}
