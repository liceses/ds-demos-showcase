from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Demo, User
from ..schemas import UserPatch, UserPublic

router = APIRouter(tags=["users"])


@router.get("/users/{username}", response_model=UserPublic)
def get_user(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在", )
    demo_count = db.query(Demo).filter(Demo.author_id == user.id).count()
    return UserPublic(
        id=user.id,
        username=user.username,
        role=user.role,
        status=user.status,
        bio=user.bio,
        created_at=user.created_at,
        demo_count=demo_count,
    )


@router.patch("/users/{user_id}", response_model=UserPublic)
def patch_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在", )
    if body.role is not None:
        user.role = body.role
    if body.status is not None:
        user.status = body.status
    db.commit()
    db.refresh(user)
    demo_count = db.query(Demo).filter(Demo.author_id == user.id).count()
    return UserPublic(
        id=user.id,
        username=user.username,
        role=user.role,
        status=user.status,
        bio=user.bio,
        created_at=user.created_at,
        demo_count=demo_count,
    )