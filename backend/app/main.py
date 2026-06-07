import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.history import router as history_router
from app.routers.ocr import router as ocr_router
from app.services.db import init_db
from app.services.model_manager import ModelManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    manager = ModelManager()
    app.state.model_manager = manager
    task = asyncio.create_task(manager.preload_default())
    app.state.model_task = task
    yield
    if not task.done():
        task.cancel()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(ocr_router)
app.include_router(history_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
