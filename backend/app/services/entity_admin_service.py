"""M3-B1..B3 实体管理统一服务（06 §A2「自由」格落地 + 协作清单 #4/#5，用户授权动后端）。

纪律（v2 制度一条不破）：
- 写操作全走 service 层：model→model_service.model_update（改名自动转别名）、
  task→task_service.update_task、tag 值→本服务内联（tags 域无独立 service 文件，
  逻辑+审计在此处收口，P4 抽 tag_service 时平移）。
- 变更全审计：谁/何时/字段/前后值/理由。
- 字段白名单逐实体定义：白名单外 422（诚实拒绝，不静默忽略）。
- 空补丁/null 补丁 422：没有任何字段变化就不产生审计行（「假动作比没动作更坏」）。
- 批量审核：逐条独立走 suggestion_service.review（每条独立提交+独立审计，
  单条失败不拖垮整批——与前端「失败列表+重试」交互同构）。

收编注记（M3-B1 基线）：本文件由并行会话半成品收编续作（t10→t11 转移；
并行会话已于 08:04 将工作树还原至 HEAD，本版自 _t11-snapshot 快照+transcript 重建）。
patch_entity 守卫次序=「实体类型 404 → 白名单 422 → 值类型 422 → 空补丁 422」，
与 test_entity_admin_v1 契约逐条对齐。
"""

from fastapi import HTTPException

from ..models import Demo, EntitySuggestion, Tag
from . import audit_service, model_service, suggestion_service, task_service

# 字段白名单（06 §A2.1/A2.2 裁决的「自由/受限」格——PATCH 是直改权的统一入口）
# Model 的对外名是 name（任务书写的 display_name/group 在库里实为 name/vendor）
MODEL_FIELDS = {"name", "vendor", "description"}
TASK_FIELDS = {"title", "description", "category", "status", "reason"}
TAG_FIELDS = {"description", "group"}


def patch_entity(db, entity_type: str, ident: str, fields: dict, actor_id: int) -> dict:
    """统一字段直改入口。fields=白名单内的键值对；返回 {type,id,updated} 供前端刷新。"""
    fields = dict(fields or {})
    # reason 是审计元数据不是实体字段：从补丁体里摘出来供审计用
    reason = str(fields.pop("reason", "") or "")

    if entity_type == "model":
        unknown = set(fields) - MODEL_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Model 不支持直改字段 {sorted(unknown)}（白名单 {sorted(MODEL_FIELDS)}）")
        _assert_str_fields(fields, MODEL_FIELDS)
        m = model_service.get_model_or_404(db, ident)
        fields = _drop_empty(fields)
        # M3-B1 契约 §31.1：reason 是审计元数据——model 分支此前把 reason 弹出后丢在地上，
        # 审计理由恒为默认「编辑实体信息」（T13 走查实锤），现补传。
        model_service.model_update(db, m, actor_id=actor_id, reason=reason, **fields)
        return {"type": "model", "id": m.id, "slug": m.slug, "updated": sorted(fields)}

    if entity_type == "task":
        unknown = set(fields) - TASK_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Task 不支持直改字段 {sorted(unknown)}（白名单 {sorted(TASK_FIELDS)}）")
        _assert_str_fields(fields, TASK_FIELDS)
        tk = task_service.get_task_or_404(db, ident)
        fields = _drop_empty(fields)
        task_service.update_task(db, tk, actor_id=actor_id, **fields)
        return {"type": "task", "id": tk.id, "slug": tk.slug, "updated": sorted(k for k in fields if k != "reason")}

    if entity_type == "tag":
        unknown = set(fields) - TAG_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Tag 值不支持直改字段 {sorted(unknown)}（白名单 {sorted(TAG_FIELDS)}）")
        _assert_str_fields(fields, TAG_FIELDS)
        try:
            tag_id = int(ident)
        except ValueError as e:
            raise HTTPException(status_code=422, detail="Tag 实体 ident 需为数值 id") from e
        tag = db.get(Tag, tag_id)
        if tag is None:
            raise HTTPException(status_code=404, detail="标签值不存在")
        fields = _drop_empty(fields)
        before = {"description": tag.description, "group": tag.group}
        if "description" in fields:
            tag.description = str(fields["description"])[:1000]
        if "group" in fields:
            tag.group = str(fields["group"]).strip() or None
        audit_service.record(
            db,
            action="update",
            entity_type="tag",
            entity_id=tag.id,
            actor_id=actor_id,
            before=before,
            after={"description": tag.description, "group": tag.group},
            reason=reason or "编辑标签值",
        )
        db.commit()
        return {"type": "tag", "id": tag.id, "key": tag.key, "value": tag.value, "updated": sorted(fields)}

    raise HTTPException(status_code=404, detail=f"未知实体类型 {entity_type}（支持 model/task/tag）")


def _assert_str_fields(fields: dict, whitelist: set[str]) -> None:
    """白名单字段一律字符串（表单语义）：list/dict/数字混入会打到 500，先诚实 422。"""
    bad = {k: type(v).__name__ for k, v in fields.items() if v is not None and not isinstance(v, str)}
    if bad:
        raise HTTPException(status_code=422, detail=f"字段值需为字符串: {bad}")


def _drop_empty(fields: dict) -> dict:
    """null = 不改该字段（这些字段没有「清空」语义，清空用空字符串）；全空即 422，不造假审计。"""
    kept = {k: v for k, v in fields.items() if v is not None}
    if not kept:
        raise HTTPException(status_code=422, detail="补丁体至少要有一个白名单字段")
    return kept


def resolve_demo_slugs(db, slugs: list[str]) -> list[int]:
    """demo slug → id（实体详情按 slug 挂题；未知 slug 整批 404，不做静默半挂）。"""
    ids: list[int] = []
    missing: list[str] = []
    for s in slugs:
        row = db.query(Demo.id).filter(Demo.slug == s).first()
        if row is None:
            missing.append(s)
        else:
            ids.append(row[0])
    if missing:
        raise HTTPException(status_code=404, detail=f"demo slug 不存在: {missing}")
    return ids


def batch_review(db, action: str, ids: list[int], actor_id: int) -> dict:
    """收件箱批量审核（06 协作清单 #4：t4 前端限速循环→真批量端点）。
    每条独立走 suggestion_service.review（approve 落对应 service + 审计；单条 409/404 不拖垮整批）。"""
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="action 需为 approve / reject")
    results: list[dict] = []
    for sid in ids:
        try:
            s = db.get(EntitySuggestion, sid)
            if s is None:
                raise HTTPException(status_code=404, detail="建议不存在")
            suggestion_service.review(db, s, action, actor_id=actor_id)
            results.append({"id": sid, "ok": True})
        except HTTPException as e:
            results.append({"id": sid, "ok": False, "error": e.detail})
        except Exception as e:  # 单条意外失败也不拖垮整批（前端失败列表可直接重试）
            results.append({"id": sid, "ok": False, "error": str(e)})
    ok_count = sum(1 for r in results if r["ok"])
    return {"action": action, "ok": ok_count, "failed": len(ids) - ok_count, "results": results}