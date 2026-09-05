"""M3-B1 实体管理统一服务（06 §A2「自由」格落地，用户授权动后端）。

纪律（v2 制度一条不破）：
- 写操作全走 service 层：model→model_service.model_update（改名自动转别名）、
  task→task_service.update_task、tag 值→本服务内联（tags 域无独立 service 文件，
  逻辑+审计在此处收口，P4 抽 tag_service 时平移）。
- 变更全审计：谁/何时/字段/前后值/理由。
- 字段白名单逐实体定义：白名单外 422（诚实拒绝，不静默忽略）。
- 空补丁/null 补丁 422：没有任何字段变化就不产生审计行（「假动作比没动作更坏」）。
"""

from fastapi import HTTPException

from ..models import Tag
from . import audit_service, model_service, task_service

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

    # 白名单字段一律字符串（表单语义）；list/dict/数字混入会打到 500，先诚实 422
    bad = {k: type(v).__name__ for k, v in fields.items() if v is not None and not isinstance(v, str)}
    if bad:
        raise HTTPException(status_code=422, detail=f"字段值需为字符串: {bad}")
    # null = 不改该字段（这些字段没有「清空」语义，语义上清空用空字符串）
    fields = {k: v for k, v in fields.items() if v is not None}
    if not fields:
        raise HTTPException(status_code=422, detail="补丁体至少要有一个白名单字段")

    if entity_type == "model":
        unknown = set(fields) - MODEL_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Model 不支持直改字段 {sorted(unknown)}（白名单 {sorted(MODEL_FIELDS)}）")
        m = model_service.get_model_or_404(db, ident)
        model_service.model_update(db, m, actor_id=actor_id, **fields)
        return {"type": "model", "id": m.id, "slug": m.slug, "updated": sorted(fields)}

    if entity_type == "task":
        unknown = set(fields) - TASK_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Task 不支持直改字段 {sorted(unknown)}（白名单 {sorted(TASK_FIELDS)}）")
        tk = task_service.get_task_or_404(db, ident)
        task_service.update_task(db, tk, actor_id=actor_id, **fields)
        return {"type": "task", "id": tk.id, "slug": tk.slug, "updated": sorted(k for k in fields if k != "reason")}

    if entity_type == "tag":
        unknown = set(fields) - TAG_FIELDS
        if unknown:
            raise HTTPException(status_code=422, detail=f"Tag 值不支持直改字段 {sorted(unknown)}（白名单 {sorted(TAG_FIELDS)}）")
        try:
            tag_id = int(ident)
        except ValueError as e:
            raise HTTPException(status_code=422, detail="Tag 实体 ident 需为数值 id") from e
        tag = db.get(Tag, tag_id)
        if tag is None:
            raise HTTPException(status_code=404, detail="标签值不存在")
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