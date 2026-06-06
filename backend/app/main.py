import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.history import router as history_router
from app.routers.ocr import router as ocr_router
from app.services.db import init_db
from app.services.ocr_engine import Pix2TexEngine


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    engine = Pix2TexEngine()
    app.state.ocr_engine = engine
    task = asyncio.create_task(engine.load_async())
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
