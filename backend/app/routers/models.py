"""模型实体公开接口（v2 B1）：列表 / 详情。管理端 CRUD 在 B4（知识治理 Section）接入。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Model
from ..schemas import ModelDetailOut, ModelListOut, Paginated
from ..serializers import preload_demo_relations, serialize_demo
from ..services import model_service

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListOut)
def list_models(
    status: str | None = Query(default=None, description="缺省=active+unverified；candidate/deprecated 需显式指定"),
    vendor: str | None = None,
    q: str | None = None,
    sort: str = Query(default="demos", pattern="^(demos|score|rating|votes|new|name)$", description="score=收缩社区分；rating 是 score 的旧别名"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = model_service.list_models(
        db, status=status, vendor=vendor, q=q, sort=sort, page=page, page_size=page_size
    )
    return ModelListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/{slug}/demos", response_model=Paginated)
def model_demos(
    slug: str,
    sort: str = Query(default="newest", pattern="^(newest|score|popular)$"),
    type: str | None = Query(default=None, description="按该模型常见的 type 值筛（facet 来自详情接口）"),
    game: str | None = Query(default=None, description="按 game 值筛"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """模型页作品清单（分页）。详情接口只带首屏 12 件，看全部走这里。"""
    model = model_service.get_model_or_404(db, slug)
    rows, total = model_service.model_demos_page(
        db, model, sort=sort, type_=type, game=game, page=page, page_size=page_size
    )
    # 复用列表序列化 + 批量预加载：每页恒定 8 条 SQL，不随页大小增长
    preload_demo_relations(db, rows)
    items = [serialize_demo(db, d) for d in rows]
    return Paginated(items=items, total=total, page=page, page_size=page_size)


@router.get("/{slug}", response_model=ModelDetailOut)
def model_detail(slug: str, db: Session = Depends(get_db)):
    # 实体解析只在 service 一处（id/slug/别名），路由不重复写查询、也不查两遍
    model = model_service.get_model_or_404(db, slug)
    detail = model_service.model_detail(db, model.id)
    assert detail is not None
    recent = model_service.recent_demos(db, model, limit=12)
    preload_demo_relations(db, recent)
    detail["recent_demos"] = [serialize_demo(db, d) for d in recent]
    return ModelDetailOut(**detail)
