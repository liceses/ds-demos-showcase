"""题目实体公开接口（v2 B1）：列表 / 详情（含按模型对比=Benchmark 数据）/ 规则建议。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import optional_user
from ..models import Demo, DemoTask, Task, User
from ..schemas import TaskDetailOut, TaskListOut, TaskSuggestItemOut
from ..serializers import preload_demo_relations, serialize_demo
from ..services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/suggest", response_model=list[TaskSuggestItemOut])
def suggest_tasks(
    q: str = Query(min_length=2, max_length=2000, description="标题/提示词/描述拼接文本"),
    limit: int = Query(default=5, ge=1, le=10),
    db: Session = Depends(get_db),
):
    """规则层（TF-IDF）相似任务建议：纯读、无 LLM；供上传页「挂到已有题目」参考。"""
    return [TaskSuggestItemOut(**s) for s in task_service.suggest_for_demo(db, q, "", "")[:limit]]


@router.get("", response_model=TaskListOut)
def list_tasks(
    status: str | None = Query(default=None, description="缺省 active；candidate 仅管理员"),
    q: str | None = None,
    category: str | None = None,
    sort: str = Query(default="demos", pattern="^(demos|newest)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    # KB-15：公开列表只出 active。旧实现把 status 原样透传，`?status=hidden|merged|candidate`
    # 都能读到未确认/已下架题目（实测 200）。
    if status and status not in ("active", "candidate"):
        raise HTTPException(status_code=422, detail="status 需为 active/candidate", )
    if status == "candidate" and not (user is not None and user.role == "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可查看待确认题目", )
    items, total = task_service.list_tasks(
        db, status=status, q=q, category=category, sort=sort, page=page, page_size=page_size
    )
    return TaskListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/{slug}", response_model=TaskDetailOut)
def task_detail(
    slug: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_user),
):
    # KB-15：merged/hidden 直接 404；candidate 仅管理员可见
    is_admin = bool(user is not None and user.role == "admin")
    detail = task_service.task_detail(db, slug, allow_candidate=is_admin)
    if detail is None:
        raise HTTPException(status_code=404, detail="题目不存在或未上架", )
    task = task_service.get_by_slug(db, slug)
    demos = (
        db.query(Demo)
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .order_by(Demo.rating_avg.desc(), Demo.created_at.desc(), Demo.id.desc())
        .limit(24)
        .all()
    )
    preload_demo_relations(db, demos)
    detail["demos"] = [serialize_demo(db, d) for d in demos]
    # 链条视图：题面 + 逐作品的证据行（一致性在服务端算，见 task_service.task_chain）
    detail["chain"] = task_service.task_chain(db, task)
    return TaskDetailOut(**detail)
