from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from ..config import settings

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/agent-guide", response_class=PlainTextResponse)
def agent_guide():
    """AI agent 上传指南全文（AI_AGENT_GUIDE.md），供 agent 直接爬取。"""
    path = settings.site_repo_path / "AI_AGENT_GUIDE.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="AI_AGENT_GUIDE.md 未找到", )
    return PlainTextResponse(path.read_text(encoding="utf-8"), media_type="text/markdown; charset=utf-8")
