from datetime import date

from fastapi import APIRouter

from ..services import visits

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/visits")
def stats_visits() -> dict:
    """站点访问统计：today/yesterday/total/last7（升序，当天在最后）。公开，无需登录。"""
    return visits.get_stats()


@router.get("/sponsors")
def stats_sponsors() -> dict:
    """赞助榜：暂未接入赞助系统，返回空榜（前端显示「暂无上榜」）。公开。"""
    return {
        "total_amount": "",
        "updated_at": date.today().isoformat(),
        "sponsors": [],
    }
