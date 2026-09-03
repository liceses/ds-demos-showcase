"""标签推导建议包（§4.2「Minimal Input, Rich Metadata」的直译）。

作者只写了标题和提示词，规则从**现有词表**里推出可选标签包：
  - `type` 走 `refine_service.classify`（14 个细分值的关键词规则）
  - `model` 走 `model:` 词表自匹配（值或介绍命中；建议包必须落在作者真能点选的候选值上，
    所以查词表而不是实体表 —— 实体要等首次上传才建出来）
  - `game/category/plugin/skills/preset` 走**词表自匹配**：值本身、或值的中文介绍
    出现在文本里就推荐 —— 这样新登记的固定值自动获得被推荐的能力，不必再改代码。

三条边界：
  1. **只建议不写库**，作者可一键收下或逐个看，全可跳过；
  2. 短英文值必须按词边界命中（`mc` 不该从 "mcdonald" 里跳出来）；
  3. 不推垃圾桶与兜底值（`type:demo`、`unspecified`）。
"""

from __future__ import annotations

import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import DemoTag, Tag, TagKey
from . import refine_service

# 参与词表自匹配的键（fixed 与 open 都吃：game 是 open 但值常带中文介绍）
VOCAB_KEYS = ("game", "category", "plugin", "skills", "preset")
# 不推荐的值：垃圾桶与兜底位
BLACKLIST_VALUES = {"demo", "unspecified"}
_MIN_ASCII = 3  # 短于此的 ASCII 值不做子串命中，避免大量误报


def _hit(raw: str, low: str, needle: str) -> bool:
    """ASCII 值按词前缀命中；非 ASCII（中文）按子串命中。"""
    n = (needle or "").strip()
    if not n:
        return False
    if n.isascii():
        if len(n) < _MIN_ASCII:
            return False
        return re.search(r"(?<![a-z0-9])" + re.escape(n.lower()), low) is not None
    return len(n) >= 2 and n in raw


def suggest_pack(
    db: Session,
    *,
    title: str = "",
    description: str = "",
    prompt: str = "",
    limit: int = 8,
) -> list[dict]:
    """返回建议包 `[{key, value, label, confidence, reason, demo_count?}]`，按置信度排序。"""
    raw = " ".join(x for x in (title, description, prompt) if x)
    if len(raw.strip()) < 4:
        return []
    low = raw.lower()
    out: list[dict] = []

    # 1) type：复用拆分流水线的规则引擎。
    #    type 是单值语义（巡检发现已有 28 件多值是脏数据），所以只推 top-1，
    #    但把次选写进理由里 —— 让人看得到备选，而不是看不到就盲收。
    cands = [c for c in refine_service.classify({"title": title, "description": description, "prompt": prompt}, {}) if c["target"] not in BLACKLIST_VALUES]
    if cands:
        top = cands[0]
        alt = f"（次选 {cands[1]['target']}）" if len(cands) > 1 else ""
        out.append(
            {
                "key": "type",
                "value": top["target"],
                "label": refine_service.LABELS_ZH.get(top["target"], top["target"]),
                "confidence": top["confidence"],
                "reason": "描述命中：" + "、".join(top["matched"][:3]) + alt,
            }
        )

    # 2) model：从 **model 词表**匹配（值本身或值的介绍），不是从实体表 ——
    #    建议包的产物必须落在作者真能点选的候选值上；而实体表要等首次上传才建出来，
    #    新库里查不到。归属工作台反过来：那里要的是实体 id，所以用 guess_model(实体表)。
    model_tags = db.query(Tag).filter(Tag.key == "model").all()
    best_model: tuple[int, Tag] | None = None
    for t in model_tags:
        if t.value in BLACKLIST_VALUES or t.value.endswith("-unknown"):
            continue  # 兜底值不作为建议（作者该主动选它，而不是被推荐）
        for needle in (t.value, t.description or ""):
            if needle and _hit(raw, low, needle):
                if best_model is None or len(needle) > best_model[0]:
                    best_model = (len(needle), t)
    if best_model is not None:
        t = best_model[1]
        out.append(
            {
                "key": "model",
                "value": t.value,
                "label": t.description or t.value,
                "confidence": 0.9,
                "reason": f"文本里出现型号名「{t.value}」",
            }
        )

    # 3) 词表自匹配：值本身 或 值的中文介绍
    rows = (
        db.query(Tag, func.count(DemoTag.demo_id))
        .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
        .join(TagKey, TagKey.key == Tag.key)
        .filter(Tag.key.in_(VOCAB_KEYS), TagKey.mode.in_(("fixed", "open")))
        .group_by(Tag.id)
        .order_by(func.count(DemoTag.demo_id).desc())
        .limit(4000)
        .all()
    )
    high_conf_keys = {x["key"] for x in out if x["confidence"] >= 0.85}
    seen = {(x["key"], x["value"]) for x in out}
    for tag, uses in rows:
        if tag.key in high_conf_keys:
            continue  # 该键已有高置信建议，不再堆同类
        hit_desc = bool(tag.description) and tag.description in raw
        if not (hit_desc or _hit(raw, low, tag.value)):
            continue
        needle = tag.description if hit_desc else tag.value
        pair = (tag.key, tag.value)
        if pair in seen:
            continue
        seen.add(pair)
        conf = 0.72 + (0.08 if len(needle) >= 4 else 0.0) + (0.05 if uses >= 10 else 0.0)
        out.append(
            {
                "key": tag.key,
                "value": tag.value,
                "label": tag.description or tag.value,
                "confidence": round(min(conf, 0.88), 2),
                "reason": f"{'介绍' if hit_desc else '名称'}命中「{needle}」（{uses} 件在用）",
                "demo_count": int(uses),
            }
        )

    out.sort(key=lambda x: -x["confidence"])
    return out[:limit]
