import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Demo, User
from ..schemas import AdminDemoOut, AdminUserOut, ReviewAction, SettingsOut, UserOut
from ..serializers import serialize_demo
from ..services import oss, settings_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/review", response_model=list[AdminDemoOut])
def review_list(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    demos = db.query(Demo).filter(Demo.status == "pending").order_by(Demo.created_at.desc()).all()
    return [serialize_demo(db, d, detail=True) for d in demos]


@router.post("/review/{slug}")
def review_demo(slug: str, body: ReviewAction, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    demo.status = "approved" if body.action == "approve" else "rejected"
    db.commit()
    return {"status": demo.status}


@router.get("/demos", response_model=list[AdminDemoOut])
def admin_demos(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    demos = db.query(Demo).order_by(Demo.created_at.desc()).all()
    return [serialize_demo(db, d, detail=True) for d in demos]


@router.get("/users", response_model=list[AdminUserOut])
def admin_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.id).all()
    result = []
    for u in users:
        demo_count = sum(1 for d in u.demos)
        result.append(
            AdminUserOut(
                id=u.id,
                username=u.username,
                role=u.role,
                status=u.status,
                bio=u.bio,
                created_at=u.created_at,
                demo_count=demo_count,
            )
        )
    return result


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return SettingsOut(
        auto_approve=settings_service.get_auto_approve(db),
        auto_approve_public=settings_service.get_auto_approve_public(db),
    )


@router.put("/settings", response_model=SettingsOut)
def update_settings(body: SettingsOut, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    settings_service.set_auto_approve(db, body.auto_approve)
    settings_service.set_auto_approve_public(db, body.auto_approve_public)
    return SettingsOut(auto_approve=body.auto_approve, auto_approve_public=body.auto_approve_public)


@router.post("/oss-sync")
def oss_sync(force: bool = Query(False), _: User = Depends(require_admin)):
    """把本地已有 demo 文件/zip/封面补传到 OSS（幂等，缺失才传）；force=true 强制全量重传。"""
    from ..services.oss_sync import sync_all

    return sync_all(force=force)


@router.get("/storage-status")
def storage_status(_: User = Depends(require_admin)):
    """本地存储规模 + 当前生效模式（oss / local）。"""
    demos_root = settings.demos_path
    demo_dirs = 0
    files = 0
    size = 0
    if demos_root.exists():
        demo_dirs = sum(1 for d in demos_root.iterdir() if d.is_dir())
        for root, _, fs in os.walk(demos_root):
            files += len(fs)
            for name in fs:
                try:
                    size += (Path(root) / name).stat().st_size
                except OSError:
                    pass
    return {
        "oss_enabled": oss.enabled(),
        # 模式：oss=OSS 直连（serve_local=false）；oss_backup=本地存储+OSS 备份（serve_local=true）；local=纯本地
        "mode": "oss" if (oss.enabled() and not settings.oss_serve_local) else ("oss_backup" if oss.enabled() else "local"),
        "local_demos": demo_dirs,
        "local_files": files,
        "local_size_bytes": size,
    }