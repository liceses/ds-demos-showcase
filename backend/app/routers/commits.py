from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Demo
from ..schemas import CommitDetailOut, CommitInfoOut
from ..services import git_service

router = APIRouter(tags=["commits"])


def _find_demo(db: Session, slug: str) -> Demo:
    demo = db.query(Demo).filter(Demo.slug == slug).first()
    if demo is None:
        raise HTTPException(status_code=404, detail="Demo 不存在", )
    return demo


@router.get("/demos/{slug}/commits", response_model=list[CommitInfoOut])
def list_commits(slug: str, db: Session = Depends(get_db)):
    _find_demo(db, slug)
    return git_service.list_commits(slug)


@router.get("/demos/{slug}/commits/{hash_value}", response_model=CommitDetailOut)
def get_commit(slug: str, hash_value: str, db: Session = Depends(get_db)):
    _find_demo(db, slug)
    return git_service.get_commit(slug, hash_value)