from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import User
from ..schemas import AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, UserOut
from ..security import (
    clear_auth_cookie,
    create_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201, response_model=AuthResponse)
def register(body: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="用户名已存在", )
    user = User(username=body.username, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    set_auth_cookie(request, response, token)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误", )
    if user.status != "active":
        raise HTTPException(status_code=403, detail="账号不可用", )
    token = create_access_token(user.id)
    set_auth_cookie(request, response, token)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/logout", status_code=204)
def logout(response: Response, user: User = Depends(current_user)):
    clear_auth_cookie(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=401, detail="原密码错误", )
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return Response(status_code=204)
