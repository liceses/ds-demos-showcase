"""Explore 聚合接口（v2 B1）：/tags 原地升级的数据源（决策 D3）。"""

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Demo, DemoTag, Tag
from ..schemas import ExploreGroupOut, ExploreOut, ExploreTagValuesOut
from ..services import model_service, task_service

router = APIRouter(prefix="/explore", tags=["explore"])


def _top_tag_values(db: Session, key: str, limit: int = 12) -> list[ExploreTagValuesOut]:
    rows = (
        db.query(Tag.value, func.count(DemoTag.demo_id))
        .join(DemoTag, DemoTag.tag_id == Tag.id)
        .join(Demo, Demo.id == DemoTag.demo_id)
        # T3·M5-B2：公开筛选/展示读口剔除 deprecated（Model 先例）
        .filter(Tag.key == key, Demo.status == "approved", Tag.status != "deprecated")
        .group_by(Tag.value)
        .order_by(func.count(DemoTag.demo_id).desc())
        .limit(limit)
        .all()
    )
    return [ExploreTagValuesOut(value=v, demos=c) for v, c in rows]


@router.get("", response_model=ExploreOut)
def explore(db: Session = Depends(get_db)):
    """四段聚合：模型（Top12+总数）/ 题目（Top8+总数）/ 描述性标签（category/type/game）。

    热门模型榜剔除兜底位（family/unknown/guess 不是型号），改为随附 `fallback_demos`
    计数，前端渲染成「其他 / 未定 N 个」折叠行。
    """
    # 排序口径换成收缩社区分：票数少的会被拉回全站先验，所以低票高分刷不到榜首
    models, models_total = model_service.list_models(
        db, sort="score", page=1, page_size=12, exclude_fallback=True
    )
    unresolved = model_service.fallback_demo_count(db)
    tasks, tasks_total = task_service.list_tasks(db, sort="demos", page=1, page_size=8)
    return ExploreOut(
        models=ExploreGroupOut(total=models_total, items=models, fallback_demos=unresolved),
        tasks_total=tasks_total,
        tasks=tasks,
        tags={
            "category": _top_tag_values(db, "category"),
            "type": _top_tag_values(db, "type"),
            "game": _top_tag_values(db, "game"),
        },
    )
