from sqlalchemy.orm import Session

from ..models import Setting

KEY_AUTO_APPROVE = "auto_approve"


def get_auto_approve(db: Session, default: bool = True) -> bool:
    row = db.get(Setting, KEY_AUTO_APPROVE)
    if row is None:
        return default
    return row.value.lower() in ("1", "true", "yes")


def set_auto_approve(db: Session, value: bool) -> None:
    row = db.get(Setting, KEY_AUTO_APPROVE)
    if row is None:
        row = Setting(key=KEY_AUTO_APPROVE, value="true" if value else "false")
        db.add(row)
    else:
        row.value = "true" if value else "false"
    db.commit()