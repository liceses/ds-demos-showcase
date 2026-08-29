import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..client_ip import get_client_ip
from ..database import get_db
from ..models import Demo
from ..schemas import SessionLogOut
from ..services import oss
from ..services.storage import demo_sessions_dir

router = APIRouter(tags=["session-logs"])

# 会话日志下载限流：每 IP 每小时最多 N 次（防 bot 爬取刷 OSS 下行流量）
_hits: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 60  # 次/小时/IP


def _rate_limit(request: Request) -> None:
    ip = get_client_ip(request) or "unknown"
    now = time.time()
    _hits[ip] = [t for t in _hits[ip] if t > now - 3600]
    if len(_hits[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="会话日志访问过于频繁，请稍后再试", )
    _hits[ip].append(now)


def _find_demo(db: Session, slug: str) -> Demo:
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    return demo


@router.get("/demos/{slug}/session-logs", response_model=list[SessionLogOut])
def list_session_logs(slug: str, request: Request, db: Session = Depends(get_db)):
    _find_demo(db, slug)
    _rate_limit(request)
    out: list[SessionLogOut] = []

    if oss.enabled():
        # 会话日志只存 OSS
        items = oss.list_prefix(f"demos/{slug}/sessions/")
        for obj in items:
            name = obj["key"].rsplit("/", 1)[-1]
            if not name:
                continue
            ts = obj.get("last_modified")
            try:
                created = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except Exception:
                created = datetime.utcnow()
            out.append(SessionLogOut(
                id=len(out) + 1,
                filename=name,
                file_size=obj.get("size", 0),
                created_at=created,
            ))
        return out

    # OSS 未启用：本地兜底
    folder = demo_sessions_dir(slug)
    if not folder.exists():
        return []
    for i, p in enumerate(sorted(folder.iterdir(), key=lambda x: x.name), start=1):
        if p.is_file():
            out.append(SessionLogOut(
                id=i,
                filename=p.name,
                file_size=p.stat().st_size,
                created_at=datetime.fromtimestamp(p.stat().st_mtime),
            ))
    return out


@router.get("/demos/{slug}/session-logs/{filename}")
def get_session_log(slug: str, filename: str, request: Request, db: Session = Depends(get_db)):
    _find_demo(db, slug)
    safe_name = Path(filename).name
    if safe_name != filename or safe_name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="非法的文件名", )

    # 防护：防 bot 爬取导致 OSS 下行流量异常
    _rate_limit(request)

    media_type = "text/plain"
    if safe_name.endswith(".md"):
        media_type = "text/markdown"
    elif safe_name.endswith(".json"):
        media_type = "application/json"

    if oss.enabled():
        data = oss.get_bytes(f"demos/{slug}/sessions/{safe_name}")
        if data is None:
            raise HTTPException(status_code=404, detail="会话日志不存在", )
        return PlainTextResponse(data.decode("utf-8", "replace"), media_type=media_type)

    folder = demo_sessions_dir(slug)
    path = folder / safe_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="会话日志不存在", )
    return PlainTextResponse(path.read_text(encoding="utf-8", errors="replace"), media_type=media_type)
