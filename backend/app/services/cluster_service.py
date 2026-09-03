"""Prompt 聚类（v2 B3′）：Task 不从标签长出来，从提示词簇长出来。

反转依赖：站内已有 235 条真实提示词（线上实测 38.5% 覆盖），其中
**11 个「精确同句」簇、8 个跨模型**（如「科幻坦克」6 个作品横跨 HY4/灰测/Qwen/GLM/Mimo）——
这批素材不需要任何相似度判断，是 Task 的最高质量种子。

两档输出（阈值来源：评审与重排.md §六 + 2026-08-31 线上语料标定）：
  - exact   ：同一句提示词（= prompt_id 语义），≥2 作品即成立，不要求跨模型
  - similar ：TF-IDF 余弦 ≥ 0.35，且 ≥3 作品 + ≥2 不同模型
    实测降到 0.25 只多 1 个簇，且混入「反向复合弩 / 双叉臂悬挂台架」这类
    主题相近但不同题的误簇；0.20 以下增长基本是噪声 → 0.35 是唯一有质量档位。

聚类只在「同句组」粒度上做（相同文本天然同簇），216 组两两余弦约 2.3 万次点积，毫秒级。
产物一律是**建议**：管理员「命名 + 点成题」才落库（治理文档：禁止无审查地自动创建 Task）。
"""

import threading
import time
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, DemoModel, DemoTag, DemoTask, Model, Tag, Task
from . import matching_service

# 标定后的默认口径（不要凭感觉调小）
MIN_SCORE = 0.35
EXACT_MIN_DEMOS = 2
SIMILAR_MIN_DEMOS = 3
SIMILAR_MIN_MODELS = 2

_CACHE_TTL = 60.0
_lock = threading.Lock()
_cache: dict[tuple, tuple[float, dict]] = {}

_STOP_TOKENS = {
    "做一个", "请做", "要求", "如下", "代码", "网页", "一个", "使用", "可以", "必须",
    "html", "css", "js", "the", "and", "with", "you", "your", "make", "create", "please",
}


def normalize_prompt(text: str) -> str:
    """与 set_demo_prompt 同口径的归一（CRLF → LF + 首尾空白）。"""
    return (text or "").replace("\r\n", "\n").strip()


def _corpus(db: Session) -> list[dict]:
    """候选语料：已上架 + 有提示词的作品，带模型名与「已被 active 题目覆盖」标记。"""
    covered = {
        did
        for (did,) in db.query(DemoTask.demo_id)
        .join(Task, Task.id == DemoTask.task_id)
        .filter(Task.status == "active")
        .all()
    }

    rows = (
        db.query(Demo)
        .filter(Demo.status == "approved", func.trim(Demo.prompt) != "", Demo.prompt.isnot(None))
        .order_by(Demo.id.asc())
        .all()
    )

    # 模型：优先实体（demo_models），迁移前/未回填时回退 model 标签——两轨都拿，避免空池
    ent: dict[int, list[str]] = defaultdict(list)
    for did, name in (
        db.query(DemoModel.demo_id, Model.name).join(Model, Model.id == DemoModel.model_id).all()
    ):
        ent[did].append(name)
    tg: dict[int, list[str]] = defaultdict(list)
    for did, value in (
        db.query(DemoTag.demo_id, Tag.value)
        .join(Tag, Tag.id == DemoTag.tag_id)
        .filter(Tag.key == "model")
        .all()
    ):
        tg[did].append(value)

    items = []
    for d in rows:
        text = normalize_prompt(d.prompt)
        if not text:
            continue
        models = sorted(set(ent.get(d.id) or []) | set(tg.get(d.id) or []))
        items.append(
            {
                "demo_id": d.id,
                "slug": d.slug,
                "title": d.title,
                "text": text,
                "models": models,
                "rating_avg": d.rating_avg or 0.0,
                "rating_count": d.rating_count or 0,
                "covered": d.id in covered,
            }
        )
    return items


def _group_rows(items: list[dict]) -> list[dict]:
    """按同句文本归组（exact 档的天然单元）。"""
    by_text: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        by_text[it["text"]].append(it)
    groups = []
    for text, members in by_text.items():
        groups.append(
            {
                "text": text,
                "members": members,
                "models": sorted({m for x in members for m in x["models"]}),
            }
        )
    groups.sort(key=lambda g: -len(g["members"]))
    return groups


def _suggested_title(members: list[dict], text: str) -> str:
    """建议题名：取簇内高频非停用分词，管理员仍需改名（不追求自动完美命名）。"""
    freq: dict[str, int] = defaultdict(int)
    for m in members:
        for t in matching_service.tokenize(m["title"]):
            if len(t) >= 2 and t not in _STOP_TOKENS:
                freq[t] += 1
    for t in matching_service.tokenize(text)[:400]:
        if len(t) >= 2 and t not in _STOP_TOKENS:
            freq[t] += 0.5
    top = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
    return "·".join(t for t, _ in top) if top else (members[0]["title"][:40] if members else "")


def _cluster(groups: list[dict], min_score: float) -> list[list[int]]:
    """组粒度 TF-IDF 余弦 + union-find（同句成员文本一致，组向量即该文本向量，无需再均值）。"""
    vectors = matching_service.vectorize_corpus([g["text"] for g in groups])

    par = list(range(len(groups)))

    def find(x: int) -> int:
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x

    for i in range(len(vectors)):
        for j in range(i + 1, len(vectors)):
            if matching_service.cosine(vectors[i], vectors[j]) >= min_score:
                ri, rj = find(i), find(j)
                if ri != rj:
                    par[ri] = rj

    comps: dict[int, list[int]] = defaultdict(list)
    for i in range(len(groups)):
        comps[find(i)].append(i)
    return list(comps.values())


def prompt_clusters(
    db: Session,
    min_score: float = MIN_SCORE,
    exact_min_demos: int = EXACT_MIN_DEMOS,
    similar_min_demos: int = SIMILAR_MIN_DEMOS,
    similar_min_models: int = SIMILAR_MIN_MODELS,
    use_cache: bool = True,
) -> dict:
    """返回 {exact: [...], similar: [...], stats: {...}}，全部是待确认建议。"""
    key = (round(min_score, 3), exact_min_demos, similar_min_demos, similar_min_models)
    if use_cache:
        with _lock:
            hit = _cache.get(key)
            if hit and hit[0] > time.time():
                return hit[1]

    items = _corpus(db)
    groups = _group_rows(items)
    result: dict = {"exact": [], "similar": [], "stats": {}}
    if not groups:
        return {"exact": [], "similar": [], "stats": {"demos_with_prompt": 0, "unique_prompts": 0}}

    # exact：单组内 ≥N 作品
    for g in groups:
        if len(g["members"]) >= exact_min_demos:
            result["exact"].append(_cluster_out(kind="exact", groups=[g], score=None))
    result["exact"].sort(key=lambda c: (-c["demo_count"], -len(c["models"])))

    # similar：多组被相似度连成一片
    exact_texts = {g["text"] for g in groups if len(g["members"]) >= exact_min_demos}
    for comp in _cluster(groups, min_score):
        if len(comp) < 2:
            continue
        gs = [groups[i] for i in comp]
        demo_n = sum(len(g["members"]) for g in gs)
        models = sorted({m for g in gs for m in g["models"]})
        if demo_n < similar_min_demos or len(models) < similar_min_models:
            continue
        # 已被 exact 覆盖的纯 exact 组不再重复出现在 similar
        if all(g["text"] in exact_texts for g in gs):
            continue
        result["similar"].append(_cluster_out(kind="similar", groups=gs, score=min_score))
    result["similar"].sort(key=lambda c: (-c["demo_count"], -len(c["models"])))

    result["stats"] = {
        "demos_with_prompt": len(items),
        "unique_prompts": len(groups),
        "exact_clusters": len(result["exact"]),
        "similar_clusters": len(result["similar"]),
        "thresholds": {
            "min_score": min_score,
            "exact_min_demos": exact_min_demos,
            "similar_min_demos": similar_min_demos,
            "similar_min_models": similar_min_models,
        },
    }
    if use_cache:
        with _lock:
            _cache[key] = (time.time() + _CACHE_TTL, result)
    return result


def _cluster_out(kind: str, groups: list[dict], score: float | None) -> dict:
    members = [m for g in groups for m in g["members"]]
    models = sorted({m for x in members for m in x["models"]})
    sample = max((g["text"] for g in groups), key=len)
    return {
        "kind": kind,
        "score": score,
        "demo_count": len(members),
        "models": models,
        "distinct_models": len(models),
        "covered": any(m["covered"] for m in members),
        "suggested_title": _suggested_title(members, sample),
        "sample_prompt": sample[:600],
        "demos": [
            {
                "demo_id": m["demo_id"],
                "slug": m["slug"],
                "title": m["title"],
                "models": m["models"],
                "rating_avg": round(m["rating_avg"], 2),
                "rating_count": m["rating_count"],
                "covered": m["covered"],
            }
            for m in sorted(members, key=lambda x: (-x["rating_count"], x["slug"]))
        ],
    }


def invalidate() -> None:
    """prompt/题目写路径调用：下次聚类强制重算。"""
    with _lock:
        _cache.clear()
