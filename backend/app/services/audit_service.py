"""知识变更审计（v2 治理地基）：写操作留痕，与业务**同事务**。

铁律：审计行与实体变更在同一个 SQLAlchemy 事务里 flush/commit ——
审计写失败必须连带回滚业务，绝不允许出现「合并了但查不到谁干的」。
因此本模块只提供 record()/snapshot_*()，**自己绝不 commit**。

回滚说明：单行 before 快照 + merged_into 指针足以人工回退（合并是引用迁移，
不删数据）；批量 migration 才需要 Operation 级 before/after 表，Task 破千再议。
"""

import json
from typing import Any

from sqlalchemy.orm import Session

from ..models import AuditLog, Model, Task


def record(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: int,
    actor_id: int | None = None,
    actor_type: str = "user",
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    reason: str = "",
) -> AuditLog:
    """写一条审计（只 add/flush，不 commit —— 由调用方的业务事务收尾）。"""
    row = AuditLog(
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before=_dump(before),
        after=_dump(after),
        reason=(reason or "")[:500],
    )
    db.add(row)
    return row


def _dump(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


# ---------------- 快照：只取关键字段，避免整行噪音 ----------------


def snapshot_model(model: Model) -> dict[str, Any]:
    return {
        "id": model.id,
        "slug": model.slug,
        "name": model.name,
        "vendor": model.vendor,
        "status": model.status,
        "merged_into_id": model.merged_into_id,
        "aliases": [a.alias for a in model.aliases],
    }


def snapshot_task(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "slug": task.slug,
        "title": task.title,
        "category": task.category,
        "status": task.status,
        "merged_into_id": task.merged_into_id,
    }
