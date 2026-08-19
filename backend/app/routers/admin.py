import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Demo, User
from ..schemas import AdminDemoOut, AdminUserOut, ReviewAction, SettingsOut, UserOut
from ..serializers import serialize_demo
from ..services import oss, settings_service, storage

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
def oss_sync(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """把本地已有 demo 文件/zip/封面补传到 OSS。
    用于 OSS 不可用期间降级为本地存储后，恢复 OSS 时一键补齐。"""
    if not oss.enabled():
        raise HTTPException(status_code=400, detail="OSS 未启用", )

    demo_ok = 0
    demo_fail = 0
    for d in db.query(Demo).all():
        try:
            storage.upload_demo_to_oss(d.slug)
            files_dir = storage.demo_files_dir(d.slug)
            if files_dir.exists():
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for p in files_dir.rglob("*"):
                        if p.is_file():
                            zf.write(p, p.relative_to(files_dir))
                oss.put_bytes(
                    f"demos/{d.slug}/{d.slug}.zip",
                    buf.getvalue(),
                    "application/zip",
                    extra_headers={"Cache-Control": "public, max-age=3600"},
                )
            demo_ok += 1
        except Exception as e:  # noqa: BLE001
            demo_fail += 1
            print(f"[oss-sync] {d.slug} 失败: {e}", flush=True)

    cover_ok = 0
    cover_fail = 0
    covers_dir = settings.media_path / "covers"
    if covers_dir.exists():
        for p in covers_dir.iterdir():
            if not p.is_file():
                continue
            try:
                import mimetypes
                content_type = mimetypes.guess_type(p.name)[0] or "image/png"
                oss.put_bytes(
                    f"media/covers/{p.name}",
                    p.read_bytes(),
                    content_type,
                    extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
                )
                cover_ok += 1
            except Exception as e:  # noqa: BLE001
                cover_fail += 1
                print(f"[oss-sync] cover {p.name} 失败: {e}", flush=True)

    return {"demos_ok": demo_ok, "demos_fail": demo_fail, "covers_ok": cover_ok, "covers_fail": cover_fail}