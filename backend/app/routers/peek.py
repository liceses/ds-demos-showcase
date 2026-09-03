"""跨实体"瞄一眼"（peek）端点：Demo 页第 3 期的侧滑预览数据源。

为什么不让前端直接复用详情接口：
- `GET /models/{slug}` 带 12 件最近作品 + 任务 + 类型/玩法分布 + 先验；
- `GET /tasks/{slug}` 带整张 Benchmark 对比表；
- `GET /demos/{slug}` 带时间线与标签全集。
抽屉里只需要"这是什么、多强、三件代表作"，把三种重载荷全拉一遍是浪费，
而且**前端要写三套取数与降级逻辑**。所以一个端点、一份紧凑结构。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Demo, DemoModel, DemoTask, Model, Task
from ..services import model_service, task_service

router = APIRouter(prefix="/peek", tags=["peek"])

KINDS = ("model", "task", "demo")


def _demo_cells(db: Session, demo_ids: list[int]) -> list[dict]:
    """按 id 批量取作品摘要（一次查询，不按 id 循环）。"""
    if not demo_ids:
        return []
    rows = db.query(Demo).filter(Demo.id.in_(demo_ids)).all()
    by_id = {d.id: d for d in rows}
    out = []
    for i in demo_ids:
        d = by_id.get(i)
        if d is None:
            continue
        out.append(
            {
                "slug": d.slug,
                "title": d.title,
                "rating_avg": round(float(d.rating_avg or 0), 2) if d.rating_count else None,
                "rating_count": int(d.rating_count or 0),
                "cover_url": d.cover_url,
            }
        )
    return out


def _peek_model(db: Session, ident: str) -> dict:
    model = model_service.get_model_or_404(db, ident)
    stats = (
        db.query(
            func.count(Demo.id),
            func.coalesce(func.sum(Demo.rating_count), 0),
            func.coalesce(func.sum(Demo.rating_avg * Demo.rating_count), 0.0),
        )
        .join(DemoModel, DemoModel.demo_id == Demo.id)
        .filter(DemoModel.model_id == model.id, Demo.status == "approved")
        .one()
    )
    demo_count, votes, wsum = int(stats[0]), int(stats[1]), float(stats[2])
    prior = model_service.score_prior(db)
    top = (
        db.query(Demo.id)
        .join(DemoModel, DemoModel.demo_id == Demo.id)
        .filter(DemoModel.model_id == model.id, Demo.status == "approved")
        .order_by(Demo.rating_avg.desc(), Demo.rating_count.desc(), Demo.id.desc())
        .limit(3)
        .all()
    )
    return {
        "kind": "model",
        "slug": model.slug,
        "name": model.name,
        "vendor": model.vendor,
        "resolution": model.resolution,
        "status": model.status,
        "description": model.description,
        "demo_count": demo_count,
        "votes": votes,
        "score": model_service.shrink_score(votes, wsum, prior),
        "sample_level": model_service.sample_level(votes),
        "demos": _demo_cells(db, [t[0] for t in top]),
        "full_path": f"/models/{model.slug}",
    }


def _peek_task(db: Session, ident: str) -> dict:
    task = task_service.get_task_or_404(db, ident)
    rows = (
        db.query(Demo.id, Demo.title)
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .order_by(Demo.rating_avg.desc(), Demo.rating_count.desc())
        .limit(3)
        .all()
    )
    # Task 没有 demos 关系（模型里只有外键侧），计数走显式查询而不是属性访问
    demo_count = (
        db.query(func.count(Demo.id))
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .scalar()
    )
    model_count = (
        db.query(func.count(func.distinct(DemoModel.model_id)))
        .join(DemoTask, DemoTask.demo_id == DemoModel.demo_id)
        .join(Model, Model.id == DemoModel.model_id)
        .filter(DemoTask.task_id == task.id)
        .scalar()
    )
    excerpt = task_service.prompt_excerpts(db, [task.id]).get(task.id, "")
    return {
        "kind": "task",
        "slug": task.slug,
        "name": task.title,
        "description": task.description or excerpt,
        "is_prompt_excerpt": not task.description and bool(excerpt),
        "demo_count": int(demo_count or 0),
        "model_count": int(model_count or 0),
        "demos": _demo_cells(db, [r[0] for r in rows]),
        "full_path": f"/tasks/{task.slug}",
    }


def _peek_demo(db: Session, ident: str) -> dict:
    demo = db.query(Demo).filter(Demo.slug == ident).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在")
    models = (
        db.query(Model)
        .join(DemoModel, DemoModel.model_id == Model.id)
        .filter(DemoModel.demo_id == demo.id, Model.status != "deprecated")
        .all()
    )
    return {
        "kind": "demo",
        "slug": demo.slug,
        "name": demo.title,
        "description": (demo.description or "")[:180],
        "demo_type": demo.demo_type,
        "rating_avg": round(float(demo.rating_avg or 0), 2) if demo.rating_count else None,
        "rating_count": int(demo.rating_count or 0),
        "cover_url": demo.cover_url,
        "models": [{"slug": m.slug, "name": m.name, "vendor": m.vendor, "resolution": m.resolution} for m in models],
        "demos": [],
        "full_path": f"/demo/{demo.slug}",
    }


@router.get("/{kind}/{ident}")
def peek(kind: str, ident: str, db: Session = Depends(get_db)):
    """紧凑实体摘要（供侧滑预览）。未知 kind → 422，不猜。"""
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail=f"kind 只能是 {', '.join(KINDS)}")
    if kind == "model":
        return _peek_model(db, ident)
    if kind == "task":
        return _peek_task(db, ident)
    return _peek_demo(db, ident)
