from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.schemas import HistoryCreate
from app.routers.common import success
from app.services.db import clear_history, create_history, delete_history, get_session, list_history

router = APIRouter(prefix="/api/history", tags=["history"])


def _get_session_id(request: Request) -> str:
    return request.headers.get("X-Session-ID", "default")


@router.get("")
async def get_history(request: Request, session: AsyncSession = Depends(get_session)):
    settings = get_settings()
    session_id = _get_session_id(request)
    records = await list_history(session, session_id=session_id, limit=settings.history_limit)
    return success([
        {"id": item.id, "latex": item.latex, "image_base64": item.image_base64, "created_at": item.created_at.isoformat()}
        for item in records
    ])


@router.post("")
async def post_history(payload: HistoryCreate, request: Request, session: AsyncSession = Depends(get_session)):
    session_id = _get_session_id(request)
    record = await create_history(session, payload.latex, payload.image_base64, session_id=session_id)
    return success({"id": record.id, "latex": record.latex, "image_base64": record.image_base64, "created_at": record.created_at.isoformat()})


@router.delete("")
async def remove_all_history(request: Request, session: AsyncSession = Depends(get_session)):
    session_id = _get_session_id(request)
    deleted = await clear_history(session, session_id=session_id)
    return success({"deleted": deleted})


@router.delete("/{record_id}")
async def remove_history(record_id: int, request: Request, session: AsyncSession = Depends(get_session)):
    session_id = _get_session_id(request)
    deleted = await delete_history(session, record_id, session_id=session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="History record not found")
    return success({"deleted": True})
