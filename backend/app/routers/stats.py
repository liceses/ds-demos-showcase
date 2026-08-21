from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import Acknowledgment, User
from ..schemas import RecognitionIn
from ..services import visits

router = APIRouter(prefix="/stats", tags=["stats"])


# ---------- 公开 ----------
@router.get("/visits")
def stats_visits() -> dict:
    """站点访问统计：today/yesterday/total/last7（升序，当天在最后）。公开。"""
    return visits.get_stats()


@router.get("/sponsors")
def stats_sponsors(db: Session = Depends(get_db)) -> dict:
    """赞助榜：按金额降序（→sort）；未公开金额的条目不返回金额字段。公开。"""
    rows = (
        db.query(Acknowledgment)
        .filter(Acknowledgment.kind == "sponsor", Acknowledgment.active == True)  # noqa: E712
        .order_by(Acknowledgment.amount.desc().nulls_last(), Acknowledgment.sort, Acknowledgment.id)
        .all()
    )
    total = 0
    sponsors = []
    for r in rows:
        total += r.amount or 0
        item: dict = {"name": r.name}
        if r.show_amount:
            item["amount"] = f"¥ {r.amount}" if r.amount is not None else ""
        if r.message:
            item["message"] = r.message
        sponsors.append(item)
    return {
        "total_amount": f"¥ {total}" if total else "",
        "updated_at": date.today().isoformat(),
        "sponsors": sponsors,
    }


@router.get("/thanks")
def stats_thanks(db: Session = Depends(get_db)) -> dict:
    """致谢榜：按添加时间倒序。公开。"""
    rows = (
        db.query(Acknowledgment)
        .filter(Acknowledgment.kind == "thanks", Acknowledgment.active == True)  # noqa: E712
        .order_by(Acknowledgment.created_at.desc(), Acknowledgment.id.desc())
        .all()
    )
    return {
        "updated_at": date.today().isoformat(),
        "thanks": [
            {"name": r.name, **({"message": r.message} if r.message else {})}
            for r in rows
        ],
    }


# ---------- 管理（admin） ----------
@router.get("/recognition")
def list_recognition(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    rows = db.query(Acknowledgment).order_by(Acknowledgment.kind, Acknowledgment.sort, Acknowledgment.id).all()
    return {"items": [
        {
            "id": r.id,
            "kind": r.kind,
            "name": r.name,
            "amount": r.amount,
            "message": r.message,
            "show_amount": r.show_amount,
            "sort": r.sort,
            "active": r.active,
        }
        for r in rows
    ]}


@router.post("/recognition", status_code=201)
def create_recognition(body: RecognitionIn, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    # sponsor 才可能有金额；thanks 忽略金额
    amount = body.amount if body.kind == "sponsor" else None
    if body.kind == "thanks":
        body.show_amount = True
    r = Acknowledgment(
        kind=body.kind,
        name=body.name.strip(),
        amount=amount,
        message=body.message.strip(),
        show_amount=body.show_amount,
        sort=body.sort,
        active=body.active,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id}


@router.put("/recognition/{rid}")
def update_recognition(
    rid: int,
    body: RecognitionIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict:
    r = db.get(Acknowledgment, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="记录不存在", )
    amount = body.amount if body.kind == "sponsor" else None
    r.kind = body.kind
    r.name = body.name.strip()
    r.amount = amount
    r.message = body.message.strip()
    r.show_amount = body.show_amount if body.kind == "sponsor" else True
    r.sort = body.sort
    r.active = body.active
    db.commit()
    return {"id": r.id}


@router.delete("/recognition/{rid}", status_code=204)
def delete_recognition(rid: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    r = db.get(Acknowledgment, rid)
    if r is None:
        raise HTTPException(status_code=404, detail="记录不存在", )
    db.delete(r)
    db.commit()
    return None
