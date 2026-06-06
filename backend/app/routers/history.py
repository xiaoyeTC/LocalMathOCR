from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schemas import HistoryCreate
from app.routers.common import success
from app.services.db import clear_history, create_history, delete_history, get_session, list_history

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def get_history(session: AsyncSession = Depends(get_session)):
    records = await list_history(session)
    return success([
        {"id": item.id, "latex": item.latex, "image_base64": item.image_base64, "created_at": item.created_at.isoformat()}
        for item in records
    ])


@router.post("")
async def post_history(payload: HistoryCreate, session: AsyncSession = Depends(get_session)):
    record = await create_history(session, payload.latex, payload.image_base64)
    return success({"id": record.id, "latex": record.latex, "image_base64": record.image_base64, "created_at": record.created_at.isoformat()})


@router.delete("")
async def remove_all_history(session: AsyncSession = Depends(get_session)):
    deleted = await clear_history(session)
    return success({"deleted": deleted})


@router.delete("/{record_id}")
async def remove_history(record_id: int, session: AsyncSession = Depends(get_session)):
    deleted = await delete_history(session, record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="History record not found")
    return success({"deleted": True})
