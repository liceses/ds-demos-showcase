from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Demo
from ..schemas import SessionLogOut
from ..services.storage import demo_sessions_dir

router = APIRouter(tags=["session-logs"])


def _find_demo(db: Session, slug: str) -> Demo:
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    return demo


@router.get("/demos/{slug}/session-logs", response_model=list[SessionLogOut])
def list_session_logs(slug: str, db: Session = Depends(get_db)):
    from datetime import datetime

    _find_demo(db, slug)
    folder = demo_sessions_dir(slug)
    if not folder.exists():
        return []
    items = []
    for i, p in enumerate(sorted(folder.iterdir(), key=lambda x: x.name), start=1):
        if p.is_file():
            mtime = datetime.fromtimestamp(p.stat().st_mtime)
            items.append(
                SessionLogOut(
                    id=i,
                    filename=p.name,
                    file_size=p.stat().st_size,
                    created_at=mtime,
                )
            )
    return items


@router.get("/demos/{slug}/session-logs/{filename}")
def get_session_log(slug: str, filename: str, db: Session = Depends(get_db)):
    _find_demo(db, slug)
    safe_name = Path(filename).name
    if safe_name != filename or safe_name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="非法的文件名", )
    folder = demo_sessions_dir(slug)
    path = folder / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="会话日志不存在", )
    content = path.read_text(encoding="utf-8", errors="replace")
    media_type = "text/plain"
    if safe_name.endswith(".md"):
        media_type = "text/markdown"
    elif safe_name.endswith(".json"):
        media_type = "application/json"
    return PlainTextResponse(content, media_type=media_type)