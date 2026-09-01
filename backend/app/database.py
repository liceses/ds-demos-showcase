from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# SQLite 数据库文件所在目录不存在时自动创建
_db_url = make_url(settings.database_url)
if _db_url.drivername == "sqlite" and _db_url.database not in (None, "", ":memory:"):
    Path(_db_url.database).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=20,
    # 拿不到连接 5s 直接失败（默认 30s）：宁可快速 500 也不要 268s 挂死拖垮全站。
    # 连接池饱和时 30s 等待会把「同时在飞请求数」放大 3000 倍 → 雪崩且只能重启自愈。
    pool_timeout=5,
    future=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """SQLite 并发读优化：WAL 模式 + 忙碌等待，避免刷新时读互相卡。"""
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
