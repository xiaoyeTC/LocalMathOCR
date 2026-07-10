from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, Integer, Text, delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings


class Base(DeclarativeBase):
    pass


class HistoryRecord(Base):
    __tablename__ = "history_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(Text, nullable=False, index=True, default="default")
    latex: Mapped[str] = mapped_column(Text, nullable=False)
    image_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


settings = get_settings()
if settings.database_url.startswith("sqlite"):
    db_path = settings.database_url.split("///")[-1]
    if db_path and db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(settings.database_url, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_add_session_id)


def _migrate_add_session_id(sync_conn) -> None:
    try:
        result = sync_conn.execute(
            __import__('sqlalchemy').text("PRAGMA table_info(history_records)")
        )
        columns = {row[1] for row in result}
        if 'session_id' not in columns:
            sync_conn.execute(
                __import__('sqlalchemy').text(
                    "ALTER TABLE history_records ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default'"
                )
            )
    except Exception:
        pass


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def create_history(session: AsyncSession, latex: str, image_base64: str | None, session_id: str = "default") -> HistoryRecord:
    record = HistoryRecord(latex=latex, image_base64=image_base64, session_id=session_id)
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def list_history(session: AsyncSession, session_id: str = "default", limit: int = 50) -> list[HistoryRecord]:
    result = await session.execute(
        select(HistoryRecord).where(HistoryRecord.session_id == session_id).order_by(HistoryRecord.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def clear_history(session: AsyncSession, session_id: str = "default") -> int:
    result = await session.execute(delete(HistoryRecord).where(HistoryRecord.session_id == session_id))
    await session.commit()
    return int(result.rowcount or 0)


async def delete_history(session: AsyncSession, record_id: int, session_id: str = "default") -> bool:
    result = await session.execute(delete(HistoryRecord).where(HistoryRecord.id == record_id, HistoryRecord.session_id == session_id))
    await session.commit()
    return bool(result.rowcount)
