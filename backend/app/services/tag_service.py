"""标签业务：键定义输出 + Tag 域唯一写入口（写操作一律同事务落审计）。

写路径为什么收在这里（KB-4）：
- tags 域曾有两个入口：`/tags/admin/*` 直接改表且不留痕、`/admin/entities/tag/*` 走
  entity_admin_service 留痕。同一件事两条路，一条查不到谁干的。
- 现在路由只做鉴权 + 转调，规则与审计在本模块收口（与 model_service/task_service 同约定）。

两条实测踩过的坑（合并/删除的完整性闸，KB-1/KB-5）：
- **merge**：SessionLocal 是 autoflush=False。把 DemoTag.tag_id 改成目标值后**必须先
  flush** 再 `db.delete(源值)` —— 否则 delete-orphan 级联会按库内旧 tag_id 把这些行当
  孤儿子行删掉，结果是「接口报 merged=1，作品标签却凭空消失」（实测复现）。
- **delete_key / delete_value**：父标签（含跨 key 子标签）直接删会撞外键抛未捕获的
  IntegrityError（500）→ 一律先校验、再 409 带影响面。
"""

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, DemoTag, Tag, TagKey, TagValueSuggestion
from ..schemas import TagKeyOut, TagKeyValueOut
from . import audit_service, matching_service

RESERVED_TAG_KEYS = {"author", "version-of"}
TAG_STATUSES = ("candidate", "active", "deprecated")

# 键级操作（增删键、分组改清）没有单行实体，审计用 entity_id=0 占位，
# 真正的对象标识放在 before/after 的 key 字段里（审计页可按 entity_type=tag 筛）。
KEY_ENTITY_ID = 0


def ensure_value(
    db: Session,
    value: str,
    group: str | None = None,
    description: str = "",
    *,
    key: str = "model",
) -> Tag:
    """取/建标签值（幂等）。**自动双写路径不落审计** —— 每次上传都会跑，逐条留痕只会
    把 audit_log 灌成噪音；真正不可逆的实体级变化由调用方（model_service）记。

    收口理由（KB-4）：Tag 表的写入只走本模块，路由与其它 service 不再自己 `Tag(...)`。
    """
    tag = db.query(Tag).filter(Tag.key == key, Tag.value == value).first()
    if tag is None:
        tag = Tag(key=key, value=value, group=group, description=description or "")
        db.add(tag)
        db.flush()
        matching_service.invalidate_alias_cache()
    return tag


def sync_status(db: Session, tag: Tag, entity_status: str) -> Tag:
    """实体状态 → 标签状态（退役 / 复活）。审计由调用方的实体级记录覆盖，这里不补行。"""
    if entity_status == "deprecated":
        if (tag.status or "active") != "deprecated":
            tag.status = "deprecated"
    elif (tag.status or "active") == "deprecated":
        tag.status = "active"
    return tag


def tag_key_out(db: Session, k: TagKey, include_deprecated: bool = False) -> TagKeyOut:
    """键的词表输出（含各固定值 demo_count）。

    读口口径（T3·M5-B2，Model 实体先例——评审与重排 §三.1「已退役不该出现在新页面」）：
    - 公开读口（上传选择器/标签词表页/derive 建议）默认**剔除 deprecated**；
    - 管理端（知识中心总表/详情导航——复活入口的数据源）用 include_deprecated=True
      保留全部状态并随附 status 徽章字段。
    """
    rows = (
        db.query(Tag, func.count(DemoTag.demo_id))
        .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == k.key)
        .group_by(Tag.id)
        .order_by(Tag.value)
        .all()
    )
    values = [
        TagKeyValueOut(
            id=t.id,
            value=t.value,
            description=t.description,
            demo_count=count,
            group=t.group,
            status=t.status or "active",
        )
        for t, count in rows
        if include_deprecated or (t.status or "active") != "deprecated"
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
        tier=k.tier or 2,
        values=values,
        demo_count=sum(v.demo_count for v in values),
        min=min_v,
        max=max_v,
    )


# ---------------- 快照 / 计数 ----------------


def tag_snapshot(tag: Tag) -> dict:
    return {
        "id": tag.id,
        "key": tag.key,
        "value": tag.value,
        "description": tag.description,
        "group": tag.group,
        "status": tag.status or "active",
        "parent_id": tag.parent_id,
    }


def _key_snapshot(k: TagKey) -> dict:
    return {
        "key": k.key,
        "mode": k.mode,
        "label": k.label,
        "description": k.description,
        "sort": k.sort,
    }


def _ref_count(db: Session, tag_id: int) -> int:
    return db.query(func.count(DemoTag.demo_id)).filter(DemoTag.tag_id == tag_id).scalar() or 0


def _children_count(db: Session, tag_id: int, *, same_key: str | None = None) -> int:
    """子标签数；same_key 非空时只数同 key 的（跨 key 引用另走 409 提示）。"""
    q = db.query(func.count(Tag.id)).filter(Tag.parent_id == tag_id)
    if same_key is not None:
        q = q.filter(Tag.key == same_key)
    return q.scalar() or 0


# ---------------- 写入口：标签值 ----------------


def create_tag_value(
    db: Session,
    *,
    key: str,
    value: str,
    description: str = "",
    group: str | None = None,
    parent_id: int | None = None,
    actor_id: int | None = None,
    reason: str = "",
) -> Tag:
    """新增固定值标签（仅 fixed 键；同 key 下值唯一）。"""
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=400, detail=f"{key} 为保留 key")
    key_def = db.get(TagKey, key)
    if key_def is None:
        raise HTTPException(status_code=422, detail="未知标签 key，请先在标签键管理中创建")
    if key_def.mode != "fixed":
        raise HTTPException(status_code=400, detail=f"{key} 为 {key_def.mode} 模式，无需预定义 value")
    if db.query(Tag).filter(Tag.key == key, Tag.value == value).first():
        raise HTTPException(status_code=409, detail="标签已存在")
    parent = None
    if parent_id is not None:
        parent = db.get(Tag, parent_id)
        if parent is None:
            raise HTTPException(status_code=404, detail="父标签不存在")
        # KB-5：父子关系必须同 key —— 跨 key 的父子在删键时会撞外键（实测 500）
        if parent.key != key:
            raise HTTPException(
                status_code=422,
                detail=f"父标签必须同 key（{parent.key}:{parent.value} 不能作为 {key} 的父级）",
            )
    tag = Tag(
        key=key,
        value=value,
        description=description or "",
        group=group,
        parent_id=parent.id if parent else None,
    )
    db.add(tag)
    db.flush()
    audit_service.record(
        db,
        action="create",
        entity_type="tag",
        entity_id=tag.id,
        actor_id=actor_id,
        after=tag_snapshot(tag),
        reason=reason or f"新增标签值 {key}:{value}",
    )
    db.commit()
    return tag


def delete_tag_value(
    db: Session,
    tag: Tag,
    *,
    actor_id: int | None = None,
    reason: str = "",
) -> None:
    """删除标签值：被 demo 引用或有子标签时拒绝（409 带影响面，不做静默级联）。"""
    if tag.key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{tag.key} 为保留 key，禁止删除")
    referenced = _ref_count(db, tag.id)
    if referenced:
        raise HTTPException(status_code=409, detail=f"该标签正被 {referenced} 个 demo 引用，禁止删除")
    children = _children_count(db, tag.id)
    if children:
        raise HTTPException(status_code=409, detail=f"该标签是 {children} 个标签的父级，请先处理子标签")
    before = tag_snapshot(tag)
    db.delete(tag)
    audit_service.record(
        db,
        action="delete",
        entity_type="tag",
        entity_id=before["id"],
        actor_id=actor_id,
        before=before,
        reason=reason or f"删除标签值 {tag.key}:{tag.value}",
    )
    db.commit()


def set_value_group(
    db: Session,
    tag: Tag,
    group: str | None,
    *,
    actor_id: int | None = None,
    reason: str = "",
) -> Tag:
    """给单个值设置/清除分组（group）。"""
    before = tag_snapshot(tag)
    tag.group = (group or "").strip() or None
    if before["group"] == tag.group:
        # 假动作守卫：同值重复置位不产生审计行
        db.commit()
        return tag
    audit_service.record(
        db,
        action="update",
        entity_type="tag",
        entity_id=tag.id,
        actor_id=actor_id,
        before=before,
        after=tag_snapshot(tag),
        reason=reason or f"分组 {before['group']} → {tag.group}",
    )
    db.commit()
    return tag


# ---------------- 写入口：标签键 ----------------


def create_tag_key(
    db: Session,
    *,
    key: str,
    mode: str,
    label: str,
    description: str = "",
    sort: int = 0,
    actor_id: int | None = None,
    reason: str = "",
) -> TagKey:
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=400, detail=f"{key} 为保留 key")
    if db.get(TagKey, key) is not None:
        raise HTTPException(status_code=409, detail="标签键已存在，请用 PUT 更新")
    k = TagKey(key=key, mode=mode, label=label, description=description, sort=sort)
    db.add(k)
    db.flush()
    audit_service.record(
        db,
        action="create",
        entity_type="tag",
        entity_id=KEY_ENTITY_ID,
        actor_id=actor_id,
        after=_key_snapshot(k),
        reason=reason or f"新建标签键 {key}（{mode}）",
    )
    db.commit()
    return k


def update_tag_key(
    db: Session,
    *,
    key: str,
    mode: str,
    label: str,
    description: str = "",
    sort: int = 0,
    actor_id: int | None = None,
    reason: str = "",
) -> TagKey:
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在")
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止修改")
    before = _key_snapshot(k)
    k.mode = mode
    k.label = label
    k.description = description
    k.sort = sort
    audit_service.record(
        db,
        action="update",
        entity_type="tag",
        entity_id=KEY_ENTITY_ID,
        actor_id=actor_id,
        before=before,
        after=_key_snapshot(k),
        reason=reason or f"编辑标签键 {key}",
    )
    db.commit()
    return k


def delete_tag_key(db: Session, key: str, *, actor_id: int | None = None, reason: str = "") -> None:
    """删除标签键（连同该键下未被引用的值）。

    拒绝条件（都返回 409 + 影响面，不再让外键抛 500）：
    - 保留 key；
    - 该键下有值被 demo 引用；
    - 该键下有值被**其它 key** 的标签当作父级（跨 key 父子会撞外键，KB-5）。
    """
    if key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail=f"{key} 为保留 key，禁止删除")
    k = db.get(TagKey, key)
    if k is None:
        raise HTTPException(status_code=404, detail="标签键不存在")
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
    key_value_ids = db.query(Tag.id).filter(Tag.key == key).scalar_subquery()
    cross_children = (
        db.query(func.count(Tag.id))
        .filter(Tag.key != key, Tag.parent_id.in_(key_value_ids))
        .scalar()
        or 0
    )
    if cross_children > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该键下有标签被其它 key 的 {cross_children} 个标签当作父级，请先解除父子关系",
        )
    values = [tag_snapshot(t) for t in db.query(Tag).filter(Tag.key == key).all()]
    before = {**_key_snapshot(k), "values": values}
    db.query(Tag).filter(Tag.key == key).delete(synchronize_session=False)
    db.delete(k)
    audit_service.record(
        db,
        action="delete",
        entity_type="tag",
        entity_id=KEY_ENTITY_ID,
        actor_id=actor_id,
        before=before,
        reason=reason or f"删除标签键 {key}（含 {len(values)} 个值）",
    )
    db.commit()


# ---------------- 写入口：分组 ----------------


def rename_group(
    db: Session,
    *,
    key: str,
    group: str,
    new_group: str,
    actor_id: int | None = None,
    reason: str = "",
) -> int:
    if new_group == group:
        return 0
    updated = (
        db.query(Tag)
        .filter(Tag.key == key, Tag.group == group)
        .update({Tag.group: new_group}, synchronize_session=False)
    )
    if not updated:
        db.commit()
        return 0
    audit_service.record(
        db,
        action="update",
        entity_type="tag",
        entity_id=KEY_ENTITY_ID,
        actor_id=actor_id,
        before={"key": key, "group": group},
        after={"key": key, "group": new_group, "updated": updated},
        reason=reason or f"分组重命名 {group} → {new_group}（{updated} 个值）",
    )
    db.commit()
    return updated


def clear_group(
    db: Session,
    *,
    key: str,
    group: str,
    actor_id: int | None = None,
    reason: str = "",
) -> int:
    cleared = (
        db.query(Tag)
        .filter(Tag.key == key, Tag.group == group)
        .update({Tag.group: None}, synchronize_session=False)
    )
    if not cleared:
        db.commit()
        return 0
    audit_service.record(
        db,
        action="update",
        entity_type="tag",
        entity_id=KEY_ENTITY_ID,
        actor_id=actor_id,
        before={"key": key, "group": group},
        after={"key": key, "group": None, "cleared": cleared},
        reason=reason or f"清除分组 {group}（{cleared} 个值）",
    )
    db.commit()
    return cleared


# ---------------- 写入口：合并 ----------------


def merge_tags(
    db: Session,
    *,
    from_key: str,
    from_value: str,
    to_key: str,
    to_value: str,
    dry_run: bool = False,
    actor_id: int | None = None,
    reason: str = "",
) -> dict:
    """合并标签值：把 from 的引用迁到 to，删除源值（单事务 + 审计）。

    dry_run 只算影响面不写库（预览不是变更，不落审计）；真合并后同事务落一条 merge 审计，
    before/after 带 moved/removed 计数与受影响 demo，便于人工回溯。
    """
    if from_key in RESERVED_TAG_KEYS or to_key in RESERVED_TAG_KEYS:
        raise HTTPException(status_code=409, detail="保留 key 禁止合并")
    if from_key != to_key:
        raise HTTPException(status_code=422, detail="跨 key 合并暂不支持")

    src = db.query(Tag).filter(Tag.key == from_key, Tag.value == from_value).first()
    if src is None:
        # 幂等：源值不存在不报错，但要如实告诉调用方「没找到」而不是假装合并成功
        return {
            "merged": 0,
            "removed_dups": 0,
            "affected_demos": 0,
            "deleted_source": False,
            "dry_run": dry_run,
            "found": False,
        }
    tgt = db.query(Tag).filter(Tag.key == to_key, Tag.value == to_value).first()
    if tgt is None:
        raise HTTPException(status_code=422, detail="目标标签不存在，请先创建")
    if src.id == tgt.id:
        return {
            "merged": 0,
            "removed_dups": 0,
            "affected_demos": 0,
            "deleted_source": False,
            "dry_run": dry_run,
            "found": True,
        }
    if _children_count(db, src.id) > 0:
        raise HTTPException(status_code=422, detail="源标签有子标签，暂不支持合并")

    assocs = db.query(DemoTag).filter(DemoTag.tag_id == src.id).all()
    moved = removed = 0
    demo_ids: set[int] = set()
    dup_demo_ids: set[int] = set()
    for a in assocs:
        demo_ids.add(a.demo_id)
        if db.query(DemoTag).filter(DemoTag.demo_id == a.demo_id, DemoTag.tag_id == tgt.id).first():
            removed += 1
            dup_demo_ids.add(a.demo_id)
        else:
            moved += 1

    if dry_run:
        return {
            "merged": moved,
            "removed_dups": removed,
            "affected_demos": len(demo_ids),
            "deleted_source": True,
            "dry_run": True,
            "found": True,
        }

    before = tag_snapshot(src)
    for a in assocs:
        if a.demo_id in dup_demo_ids:
            db.delete(a)
        else:
            a.tag_id = tgt.id
    # 关键（KB-1）：先把 tag_id 变更 flush 落库，再删源值。
    # 少了这一行，delete-orphan 级联会按库内旧 tag_id 把刚迁走的行当孤儿子行删掉。
    db.flush()
    # 同值的 pending 申请标记为已拒绝（避免审核出重复）
    db.query(TagValueSuggestion).filter(
        TagValueSuggestion.key == from_key,
        TagValueSuggestion.value == from_value,
        TagValueSuggestion.status == "pending",
    ).update({TagValueSuggestion.status: "rejected"}, synchronize_session=False)
    db.delete(src)
    audit_service.record(
        db,
        action="merge",
        entity_type="tag",
        entity_id=before["id"],
        actor_id=actor_id,
        before=before,
        after={
            "merged_into": {"id": tgt.id, "key": tgt.key, "value": tgt.value},
            "moved": moved,
            "removed_dups": removed,
            "affected_demos": sorted(demo_ids),
        },
        reason=reason or f"合并 {from_key}:{from_value} → {to_key}:{to_value}（迁移 {moved} 个引用）",
    )
    db.commit()

    # 派生数据回填：model 键影响 demo_models 双写，rounds/time/platform 影响 demo 列（KB-1/KB-2）
    if demo_ids and (from_key == "model" or from_key in ("rounds", "time", "platform")):
        from . import model_service

        for demo in db.query(Demo).filter(Demo.id.in_(sorted(demo_ids))).all():
            db.expire(demo, ["tag_associations"])
            model_service.sync_demo_models(db, demo)
            model_service.sync_run_meta(demo)
        db.commit()

    return {
        "merged": moved,
        "removed_dups": removed,
        "affected_demos": len(demo_ids),
        "deleted_source": True,
        "dry_run": False,
        "found": True,
    }
