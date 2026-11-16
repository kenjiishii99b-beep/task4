"""DB 接続。

Azure Functions ではインスタンスが再利用されるため、engine はモジュール読み込み時に 1 回だけ作成し、
リクエストごとに Session だけを払い出す（接続数の溢れを防ぐ）。
"""

from collections.abc import Iterator

import certifi
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _build_engine():
    settings = get_settings()
    url = settings.DATABASE_URL
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})

    connect_args: dict = {"charset": "utf8mb4"}
    if settings.MYSQL_SSL:
        connect_args["ssl"] = {"ca": settings.MYSQL_SSL_CA or certifi.where()}
    return create_engine(
        url,
        connect_args=connect_args,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=280,
    )


engine = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
