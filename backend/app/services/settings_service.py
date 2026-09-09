"""站点设置读写。

KB-22：批量写走 `apply(db, changes)` —— 只 flush 不 commit，由调用方在一个事务里
连同审计一起提交。单字段 setter 保留（内部就是 apply + commit），既有调用方不受影响。
"""

from sqlalchemy.orm import Session

from ..models import Setting

KEY_AUTO_APPROVE = "auto_approve"
KEY_AUTO_APPROVE_PUBLIC = "auto_approve_public"
KEY_FUN_MODE = "fun_mode"

_BOOL_KEYS = (KEY_AUTO_APPROVE, KEY_AUTO_APPROVE_PUBLIC, KEY_FUN_MODE)


def _get_bool(db: Session, key: str, default: bool) -> bool:
    row = db.get(Setting, key)
    if row is None:
        return default
    return row.value.lower() in ("1", "true", "yes")


def _set_bool(db: Session, key: str, value: bool) -> None:
    """只写不提交（KB-22）：由调用方决定事务边界。"""
    row = db.get(Setting, key)
    text = "true" if value else "false"
    if row is None:
        db.add(Setting(key=key, value=text))
    else:
        row.value = text


def get_auto_approve(db: Session, default: bool = True) -> bool:
    return _get_bool(db, KEY_AUTO_APPROVE, default)


def set_auto_approve(db: Session, value: bool) -> None:
    _set_bool(db, KEY_AUTO_APPROVE, value)
    db.commit()


def get_auto_approve_public(db: Session, default: bool = False) -> bool:
    """未注册（public）上传是否直接放行；默认关。"""
    return _get_bool(db, KEY_AUTO_APPROVE_PUBLIC, default)


def set_auto_approve_public(db: Session, value: bool) -> None:
    _set_bool(db, KEY_AUTO_APPROVE_PUBLIC, value)
    db.commit()


def get_fun_mode(db: Session, default: bool = False) -> bool:
    """整活模式（纯前端显示层替换 ds-unknown→astra-grey 等）；默认关。"""
    return _get_bool(db, KEY_FUN_MODE, default)


def set_fun_mode(db: Session, value: bool) -> None:
    _set_bool(db, KEY_FUN_MODE, value)
    db.commit()


def snapshot(db: Session) -> dict:
    """当前三项设置的快照（审计 before/after 用）。"""
    return {
        KEY_AUTO_APPROVE: get_auto_approve(db),
        KEY_AUTO_APPROVE_PUBLIC: get_auto_approve_public(db),
        KEY_FUN_MODE: get_fun_mode(db),
    }


def apply(db: Session, changes: dict[str, bool]) -> dict:
    """批量写（只 flush，不 commit）。changes 只含要改的键，未提供的键保持原值。"""
    unknown = set(changes) - set(_BOOL_KEYS)
    if unknown:
        raise ValueError(f"未知设置键: {sorted(unknown)}")
    for key, value in changes.items():
        _set_bool(db, key, bool(value))
    db.flush()
    return snapshot(db)
