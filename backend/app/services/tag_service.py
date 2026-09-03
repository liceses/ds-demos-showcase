"""标签业务：标签键输出（含 group/min/max）。"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import DemoTag, Tag, TagKey
from ..schemas import TagKeyOut, TagKeyValueOut


def tag_key_out(db: Session, k: TagKey) -> TagKeyOut:
    rows = (
        db.query(Tag, func.count(DemoTag.demo_id))
        .outerjoin(DemoTag, DemoTag.tag_id == Tag.id)
        .filter(Tag.key == k.key)
        .group_by(Tag.id)
        .order_by(Tag.value)
        .all()
    )
    values = [
        TagKeyValueOut(id=t.id, value=t.value, description=t.description, demo_count=count, group=t.group)
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
        tier=k.tier or 2,
        values=values,
        demo_count=sum(v.demo_count for v in values),
        min=min_v,
        max=max_v,
    )
