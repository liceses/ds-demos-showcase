import time
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import optional_user, require_admin
from ..models import Demo, DemoTag, Tag, TagKey, TagValueSuggestion, User
from ..schemas import (
    AiSuggestIn,
    TagCreate,
    TagDetail,
    TagKeyOut,
    TagKeyUpsert,
    TagKeyValueOut,
    TagOut,
    TagSuggestionReview,
    TagValueSuggestionIn,
    TagValueSuggestionOut,
)
from ..serializers import tag_dict

router = APIRouter(prefix="/tags", tags=["tags"])

# 用户申请固定值限流：每 IP 每小时 10 次
_suggest_hits: dict[str, list[float]] = defaultdict(list)
_SUGGEST_RATE = 10


@router.get("/tag-keys", response_model=list[TagKeyOut])
def list_tag_keys(db: Session = Depends(get_db)):
    """标签键定义（供发布/编辑页做选择器 + 标签主页展示）。"""
    keys = db.query(TagKey).order_by(TagKey.sort, TagKey.key).all()
    return [_tag_key_out(db, k) for k in keys]


def find_tag_by_key_value(db: Session, key_value: str) -> Tag:
    if ":" not in key_value:
        raise HTTPException(status_code=404, detail="标签不存在", )
    key, value = key_value.split(":", 1)
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        raise HTTPException(status_code=404, detail="标签不存在", )
    return tag


@router.get("/{key_value}", response_model=TagDetail)
def get_tag(key_value: str, db: Session = Depends(get_db)):
    tag = find_tag_by_key_value(db, key_value)
    data = tag_dict(db, tag)
    data["parent"] = tag_dict(db, tag.parent) if tag.parent else None
    data["children"] = [tag_dict(db, c) for c in tag.children]
    return data


@router.post("", status_code=201, response_model=TagOut)
def create_tag(body: TagCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """新增固定值标签（仅 admin）。"""
    if body.key == "author":
        raise HTTPException(status_code=400, detail="author 为保留 key", )
    key_def = db.get(TagKey, body.key)
    if key_def is None:
        raise HTTPException(status_code=400, detail="未知标签 key，请先在标签键管理中创建", )
    if key_def.mode != "fixed":
        raise HTTPException(status_code=400, detail=f"{body.key} 为 {key_def.mode} 模式，无需预定义 value", )
    duplicate = db.query(Tag).filter(Tag.key == body.key, Tag.value == body.value).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="标签已存在", )
    if body.parent_id is not None:
        parent = db.get(Tag, body.parent_id)
        if parent is None:
            raise HTTPException(status_code=404, detail="父标签不存在", )
    tag = Tag(
        key=body.key,
        value=body.value,
        description=body.description,
        group=body.group,
        parent_id=body.parent_id,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag_dict(db, tag)


# ---------- 标签键管理（admin） ----------
@router.post("/admin/tag-keys", status_code=201, response_model=TagKeyOut)
def create_tag_key(body: TagKeyUpsert, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if body.key == "author":
        raise HTTPException(status_code=400, detail="author 为保留 key", )
    existing = db.get(TagKey, body.key)
    if existing is not None:
        raise HTTPException(status_code=409, detail="标签键已存在，请用 PUT 更新", )
    k = TagKey(
        key=body.key,
        mode=body.mode,
        label=body.label,
        description=body.description,
        sort=body.sort,
    )
    db.add(k)
    db.commit()
    return _tag_key_out(db, k)


RESERVED_TAG_KEYS = {"author", "version-of"}


@router.put("/admin/tag-keys/{key}", response_model=TagKeyOut)
def update_tag_key(
    key: str,
    body: TagKeyUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在", )
    k.mode = body.mode
    k.label = body.label
    k.description = body.description
    k.sort = body.sort
    db.commit()
    return _tag_key_out(db, k)


@router.delete("/admin/tag-keys/{key}", status_code=204)
def delete_tag_key(key: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """删除标签键（同时删除该键下未被引用的标签值）。"""
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止删除", )
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在", )
    referenced = (
        db.query(func.count(DemoTag.demo_id))
        .join(Tag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == key)
        .scalar()
        or 0
    )
    if referenced > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该键下有 {referenced} 个标签正被 demo 引用，禁止删除",
        )
    db.query(Tag).filter(Tag.key == key).delete(synchronize_session=False)
    db.delete(k)
    db.commit()


@router.delete("/admin/tag-keys/{key}/values/{value}", status_code=204)
def delete_tag_value(
    key: str,
    value: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """删除某个标签值（被 demo 引用时禁止删除）。"""
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止删除", )
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        raise HTTPException(status_code=404, detail="标签值不存在", )
    referenced = (
        db.query(func.count(DemoTag.demo_id)).filter(DemoTag.tag_id == tag.id).scalar() or 0
    )
    if referenced > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该标签正被 {referenced} 个 demo 引用，禁止删除",
        )
    db.delete(tag)
    db.commit()


def _tag_key_out(db: Session, k: TagKey) -> TagKeyOut:
    rows = (
        db.query(Tag, func.count(DemoTag.demo_id))
        .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == k.key)
        .group_by(Tag.id)
        .order_by(Tag.value)
        .all()
    )
    values = [
        TagKeyValueOut(value=t.value, description=t.description, demo_count=count, group=t.group)
        for t, count in rows
    ]
    min_v = max_v = None
    if k.mode == "int":
        nums = []
        for v in values:
            try:
                nums.append(int(v.value))
            except ValueError:
                continue
        if nums:
            min_v, max_v = min(nums), max(nums)
    return TagKeyOut(
        key=k.key,
        mode=k.mode,
        label=k.label,
        description=k.description,
        sort=k.sort,
        values=values,
        demo_count=sum(v.demo_count for v in values),
        min=min_v,
        max=max_v,
    )


# ---------- 固定值申请（用户） ----------
def _suggest_rate_limit(request: Request) -> None:
    fwd = request.headers.get("x-forwarded-for", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    now = time.time()
    _suggest_hits[ip] = [t for t in _suggest_hits[ip] if t > now - 3600]
    if len(_suggest_hits[ip]) >= _SUGGEST_RATE:
        raise HTTPException(status_code=429, detail="申请过于频繁，请稍后再试", )
    _suggest_hits[ip].append(now)


@router.post("/suggestions", status_code=201, response_model=TagValueSuggestionOut)
def create_suggestion(
    body: TagValueSuggestionIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    """用户申请新增 fixed 标签值：只写 pending 建议，不直接创建 Tag。"""
    _suggest_rate_limit(request)
    key_def = db.get(TagKey, body.key)
    if key_def is None:
        raise HTTPException(status_code=422, detail="未知标签 key", )
    if key_def.mode != "fixed":
        raise HTTPException(status_code=422, detail=f"{body.key} 为 {key_def.mode} 模式，无需申请固定值", )
    if db.query(Tag).filter(Tag.key == body.key, Tag.value == body.value).first():
        raise HTTPException(status_code=409, detail="该固定值已存在", )
    if db.query(TagValueSuggestion).filter(
        TagValueSuggestion.key == body.key,
        TagValueSuggestion.value == body.value,
        TagValueSuggestion.status == "pending",
    ).first():
        raise HTTPException(status_code=409, detail="已有待审核的相同申请", )
    s = TagValueSuggestion(
        key=body.key,
        value=body.value,
        description=body.description,
        group=body.group,
        demo_id=body.demo_id,
        created_by=user.id if user else None,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


# ---------- 固定值建议审核（admin） ----------
@router.get("/admin/suggestions", response_model=list[TagValueSuggestionOut])
def list_suggestions(
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(TagValueSuggestion)
    if status:
        q = q.filter(TagValueSuggestion.status == status)
    return q.order_by(TagValueSuggestion.created_at.desc()).all()


@router.post("/admin/suggestions/{sid}/review", response_model=TagValueSuggestionOut)
def review_suggestion(
    sid: int,
    body: TagSuggestionReview,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    s = db.get(TagValueSuggestion, sid)
    if s is None:
        raise HTTPException(status_code=404, detail="建议不存在", )
    if s.status != "pending":
        raise HTTPException(status_code=409, detail="该建议已处理", )
    if body.action == "approve":
        tag = db.query(Tag).filter(Tag.key == s.key, Tag.value == s.value).first()
        if tag is None:
            tag = Tag(key=s.key, value=s.value, description=s.description, group=s.group or body.group)
            db.add(tag)
            db.flush()
        # 可选：同时补挂到提交者 demo
        if s.demo_id:
            demo = db.get(Demo, s.demo_id)
            if demo and not db.query(DemoTag).filter(DemoTag.demo_id == demo.id, DemoTag.tag_id == tag.id).first():
                db.add(DemoTag(demo_id=demo.id, tag_id=tag.id))
        s.status = "approved"
    else:
        s.status = "rejected"
    s.reviewed_by = admin.id
    s.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return s


# ---------- AI 辅助整理（admin，只返回建议不落库） ----------
@router.post("/admin/fetch-models")
def fetch_models(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """抓取/整理主流 AI 模型：写入 model 键的 pending 建议（人工审核后生效）。"""
    curated = [
        ("DeepSeek", ["dsv4-flash", "dsv4-pro", "dsv4", "ds-unknown", "dsv4flash"]),
        ("OpenAI", ["gpt-4o", "gpt-4o-mini", "o1", "o3"]),
        ("Anthropic", ["claude-3-5-sonnet", "claude-3-7-sonnet", "claude-4-sonnet"]),
        ("Google", ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-3.7-flash"]),
        ("Meta", ["llama-3.1-70b", "llama-3.3-70b"]),
        ("Mistral", ["mistral-large", "mistral-medium"]),
        ("Qwen", ["qwen2.5-72b", "qwen3-235b"]),
        ("Kimi", ["moonshot-v1-32k", "kimi-k2"]),
    ]
    created = 0
    for group, models in curated:
        for m in models:
            if db.query(Tag).filter(Tag.key == "model", Tag.value == m).first():
                continue
            if db.query(TagValueSuggestion).filter(
                TagValueSuggestion.key == "model",
                TagValueSuggestion.value == m,
                TagValueSuggestion.status == "pending",
            ).first():
                continue
            db.add(TagValueSuggestion(key="model", value=m, description="", group=group, status="pending"))
            created += 1
    db.commit()
    return {"created": created, "note": "已写入 pending 建议，需人工审核后生效"}


@router.post("/admin/ai-suggest")
def ai_suggest(
    body: AiSuggestIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """AI 辅助整理：输入 demo 信息，返回推荐标签（只建议，不写库）。
    当前为规则启发式占位，后续可接入真实 LLM。"""
    demo = db.get(Demo, body.demo_id) if body.demo_id else None
    text = (f"{demo.title} {demo.description}" if demo else body.text or "").lower()
    suggestions: list[dict] = []

    type_map = [
        ("游戏", ["游戏", "play", "game", "小游戏"]),
        ("动画", ["动画", "animation", "canvas"]),
        ("3D建模", ["3d", "建模", "three", "webgl"]),
        ("仿真", ["仿真", "simulation", "物理"]),
        ("图形学", ["图形", "graphics", "shader", "粒子"]),
    ]
    for label, kws in type_map:
        if any(k in text for k in kws):
            suggestions.append({"key": "type", "value": label, "reason": f"描述命中关键词：{kws[0]}"})
            break

    if "deepseek" in text or "dsv" in text:
        suggestions.append({"key": "model", "value": "dsv4-flash", "reason": "描述提到 DeepSeek/DSV"})
    if "gemini" in text:
        suggestions.append({"key": "model", "value": "gemini-3.7-flash", "reason": "描述提到 Gemini"})

    return {
        "suggestions": suggestions,
        "note": "规则版占位，仅作参考；接入真实 LLM 后更准。确认后请手动/接口写入标签。",
    }
