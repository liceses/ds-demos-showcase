"""治理巡检（B4）：把「站点的结构性缺口」变成可处理的清单。

与 `knowledge_stats` 的分工：体检是**读数**（覆盖率、积压量），巡检是**待办**——
每个检查项要么能一键生成候选进收件箱（走 `queue()`），要么如实标成 warn/info
（只能看，比如「缺提示词」机器编不出来）。**绝不为了有按钮而造一个假动作。**
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, DemoModel, DemoTag, EntitySuggestion, Model, Tag, TagKey
from . import refine_service, suggestion_service

# level: action=有可自动执行的补救 | warn=需要人看但没有自动动作 | info=背景读数
CHECKS: dict[str, dict] = {
    "type_missing": {"label": "作品没有 type 标签", "level": "action", "hint": "规则可从提示词/标题推断，生成补值候选"},
    "type_multi": {"label": "作品挂了多个 type", "level": "action", "hint": "只处理含 demo 的组合（删垃圾桶留具体值）"},
    "demo_left": {"label": "仍挂 type:demo 且规则无信号", "level": "warn", "hint": "机器没把握，需人工逐件看"},
    "no_prompt": {"label": "缺第一轮提示词", "level": "warn", "hint": "只能靠作者/管理员补，机器编不出来"},
    "model_fallback": {"label": "挂在兜底型号上的作品", "level": "warn", "hint": "去「归属工作台」处理"},
    "fixed_no_desc": {"label": "固定值缺少介绍", "level": "warn", "hint": "词表补课：悬浮提示与搜索都依赖它"},
    "orphan_values": {"label": "零引用的标签值", "level": "info", "hint": "可能错拼或已废弃，人工决定清理"},
    "dup_model_slug": {"label": "重复 slug 的模型实体", "level": "warn", "hint": "违反实体唯一性，需要合并"},
    "inbox_pending": {"label": "收件箱积压", "level": "info", "hint": "待人工批准的候选数"},
}

_QUEUEABLE = ("type_missing", "type_multi")


def _approved(db: Session):
    return db.query(Demo).filter(Demo.status == "approved")


def _type_values(db: Session, demo: Demo) -> list[str]:
    return [l.tag.value for l in demo.tag_associations if l.tag.key == "type"]


def _tags_of(demo: Demo) -> dict[str, list[str]]:
    tags: dict[str, list[str]] = {}
    for l in demo.tag_associations:
        tags.setdefault(l.tag.key, []).append(l.tag.value)
    return tags


def _proposals(db: Session, demo: Demo) -> list[dict]:
    return refine_service.classify(
        {"prompt": demo.prompt or "", "title": demo.title or "", "description": demo.description or ""},
        _tags_of(demo),
    )


def _missing_type(db: Session) -> list[Demo]:
    has_type = (
        db.query(DemoTag.demo_id).join(Tag, Tag.id == DemoTag.tag_id).filter(Tag.key == "type").distinct()
    )
    return _approved(db).filter(Demo.id.notin_(has_type)).all()


def _multi_type(db: Session) -> list[tuple[Demo, list[str]]]:
    rows = (
        db.query(DemoTag.demo_id, func.group_concat(Tag.value))
        .join(Tag, Tag.id == DemoTag.tag_id)
        .filter(Tag.key == "type")
        .group_by(DemoTag.demo_id)
        .having(func.count(Tag.id) > 1)
        .all()
    )
    out = []
    for demo_id, values in rows:
        d = db.get(Demo, demo_id)
        if d is not None and d.status == "approved":
            out.append((d, sorted(set((values or "").split(",")))))
    return out


def _demo_bucket(db: Session) -> list[Demo]:
    return (
        _approved(db)
        .join(DemoTag, DemoTag.demo_id == Demo.id)
        .join(Tag, Tag.id == DemoTag.tag_id)
        .filter(Tag.key == "type", Tag.value == "demo")
        .all()
    )


def run(db: Session, *, sample_limit: int = 8) -> dict:
    """跑全部巡检项：读数 + 可执行性 + 抽样（抽样让人肉眼判断规则是否可信）。"""
    approved = _approved(db).count()
    checks: list[dict] = []

    def emit(check_id: str, count: int, **extra) -> None:
        checks.append({"id": check_id, **CHECKS[check_id], "count": count, "can_queue": check_id in _QUEUEABLE, **extra})

    missing = _missing_type(db)
    emit("type_missing", len(missing), rate=round(len(missing) / approved, 3) if approved else 0,
         samples=[{"slug": d.slug, "title": d.title} for d in missing[:sample_limit]])

    multi = _multi_type(db)
    fixable = [d for d, vs in multi if "demo" in vs]
    emit("type_multi", len(multi), fixable=len(fixable),
         samples=[{"slug": d.slug, "title": d.title, "types": vs} for d, vs in multi[:sample_limit]])

    no_signal = [d for d in _demo_bucket(db) if not _proposals(db, d)]
    emit("demo_left", len(no_signal), samples=[{"slug": d.slug, "title": d.title} for d in no_signal[:sample_limit]])

    no_prompt = _approved(db).filter(func.trim(func.coalesce(Demo.prompt, "")) == "").count()
    emit("no_prompt", no_prompt, rate=round(no_prompt / approved, 3) if approved else 0)

    from .model_service import FALLBACK_RESOLUTIONS

    fallback = (
        db.query(func.count(func.distinct(DemoModel.demo_id)))
        .join(Demo, Demo.id == DemoModel.demo_id)
        .join(Model, Model.id == DemoModel.model_id)
        .filter(Demo.status == "approved", Model.resolution.in_(FALLBACK_RESOLUTIONS))
        .scalar()
        or 0
    )
    emit("model_fallback", fallback)

    fixed_no_desc = (
        db.query(func.count(Tag.id))
        .join(TagKey, TagKey.key == Tag.key)
        .filter(TagKey.mode == "fixed", func.trim(func.coalesce(Tag.description, "")) == "")
        .scalar()
        or 0
    )
    emit("fixed_no_desc", fixed_no_desc)

    used = db.query(DemoTag.tag_id).distinct()
    orphans = db.query(Tag).filter(Tag.id.notin_(used)).order_by(Tag.key, Tag.value).all()
    emit("orphan_values", len(orphans), samples=[{"key": t.key, "value": t.value} for t in orphans[:sample_limit]])

    dup = [s for (s,) in db.query(Model.slug).group_by(Model.slug).having(func.count(Model.id) > 1).all()]
    emit("dup_model_slug", len(dup), samples=[{"slug": s} for s in dup[:sample_limit]])

    pending = db.query(func.count(EntitySuggestion.id)).filter(EntitySuggestion.status == "pending").scalar() or 0
    emit("inbox_pending", pending)

    return {"approved": approved, "checks": checks, "total_findings": sum(c["count"] for c in checks)}


def entity_conflicts(db: Session) -> dict:
    """规范化同名冲突组（合并向导的前门）：`dsv4-flash` 与 `dsv4flash` 这类同物异名。

    匹配层用 normalize（吃掉分隔符/大小写），所以**两个实体规范化后同键**时，
    第三种写法会归到其中一个、另一种可能归到另一个 —— 数据会悄悄分叉，必须看得见。
    只报不动手：合并动作在「合并向导」里，且必须先 dry_run 预览影响面。
    """
    from ..models import DemoTask, Task
    from . import matching_service

    def build(rows, key_of, label_of, demo_count):
        buckets: dict[str, list[dict]] = {}
        for obj in rows:
            buckets.setdefault(matching_service.normalize(key_of(obj)), []).append(
                {"id": obj.id, "label": label_of(obj), "demos": demo_count(obj.id)}
            )
        out = [
            {"key": k, "items": sorted(v, key=lambda x: -x["demos"])}
            for k, v in buckets.items()
            if len(v) > 1
        ]
        out.sort(key=lambda g: -sum(x["demos"] for x in g["items"]))
        return out

    model_demos = dict(db.query(DemoModel.model_id, func.count(DemoModel.demo_id)).group_by(DemoModel.model_id).all())
    task_demos = dict(db.query(DemoTask.task_id, func.count(DemoTask.demo_id)).group_by(DemoTask.task_id).all())

    models = build(
        db.query(Model).filter(Model.status != "deprecated").all(),
        lambda m: m.name,
        lambda m: m.name,
        lambda mid: model_demos.get(mid, 0),
    )
    tasks = build(
        db.query(Task).filter(Task.status.notin_(("merged", "hidden"))).all(),
        lambda t: t.title,
        lambda t: t.title,
        lambda tid: task_demos.get(tid, 0),
    )
    return {"models": models, "tasks": tasks, "groups": len(models) + len(tasks)}


def queue(db: Session, check_id: str, *, actor_id: int | None = None, min_confidence: float = 0.8) -> dict:
    """把可执行巡检项落成候选（复用 `retag_demo` 通道；批准与执行仍在收件箱那条路上）。"""
    if check_id not in _QUEUEABLE:
        raise HTTPException(status_code=422, detail=f"巡检项「{CHECKS.get(check_id, {}).get('label', check_id)}」没有可自动执行的补救动作")

    if check_id == "type_multi":
        targets = [(d, [v for v in vs if v != "demo"]) for d, vs in _multi_type(db) if "demo" in vs]
    else:
        targets = [(d, None) for d in _missing_type(db)]

    proposed = queued = 0
    for d, keep in targets:
        if check_id == "type_multi":
            if not keep:
                continue
            proposed += 1
            payload = {
                "demo_id": d.id, "demo_slug": d.slug, "demo_title": d.title,
                "remove": ["demo"], "add": keep[0], "alt": keep[1:],
                "matched": ["多值收敛：删掉垃圾桶值 demo，保留更具体的 type"],
                "reason": "巡检：type 多值收敛",
            }
            conf = 0.95  # 纯机械判断，不含猜测
        else:
            cands = _proposals(db, d)
            if not cands or cands[0]["confidence"] < min_confidence:
                continue
            top = cands[0]
            proposed += 1
            payload = {
                "demo_id": d.id, "demo_slug": d.slug, "demo_title": d.title,
                "remove": [], "add": top["target"], "alt": [c["target"] for c in cands[1:3]],
                "matched": top["matched"],
                "reason": "巡检：补 type 值 —— " + "、".join(top["matched"][:4]),
            }
            conf = top["confidence"]

        made = suggestion_service.create(
            db, kind="retag_demo", payload=payload, confidence=conf,
            source="inferred", demo_id=d.id, created_by=actor_id,
        )
        if made is not None:
            queued += 1
    db.commit()
    return {"check": check_id, "proposed": proposed, "queued": queued}
