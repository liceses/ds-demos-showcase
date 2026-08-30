from sqlalchemy.orm import Session

from ..models import Setting

KEY_AUTO_APPROVE = "auto_approve"
KEY_AUTO_APPROVE_PUBLIC = "auto_approve_public"


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


def get_auto_approve_public(db: Session, default: bool = False) -> bool:
    """未注册（public）上传是否直接放行；默认关。"""
    row = db.get(Setting, KEY_AUTO_APPROVE_PUBLIC)
    if row is None:
        return default
    return row.value.lower() in ("1", "true", "yes")


def set_auto_approve_public(db: Session, value: bool) -> None:
    row = db.get(Setting, KEY_AUTO_APPROVE_PUBLIC)
    if row is None:
        row = Setting(key=KEY_AUTO_APPROVE_PUBLIC, value="true" if value else "false")
        db.add(row)
    else:
        row.value = "true" if value else "false"
    db.commit()


KEY_FUN_MODE = "fun_mode"


def get_fun_mode(db: Session, default: bool = False) -> bool:
    """整活模式（纯前端显示层替换 ds-unknown→astra-grey 等）；默认关。"""
    row = db.get(Setting, KEY_FUN_MODE)
    if row is None:
        return default
    return row.value.lower() in ("1", "true", "yes")


def set_fun_mode(db: Session, value: bool) -> None:
    row = db.get(Setting, KEY_FUN_MODE)
    if row is None:
        row = Setting(key=KEY_FUN_MODE, value="true" if value else "false")
        db.add(row)
    else:
        row.value = "true" if value else "false"
    db.commit()