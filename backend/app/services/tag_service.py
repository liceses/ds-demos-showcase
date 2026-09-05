"""标签业务：标签键输出（含 group/min/max）。"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import DemoTag, Tag, TagKey
from ..schemas import TagKeyOut, TagKeyValueOut


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
