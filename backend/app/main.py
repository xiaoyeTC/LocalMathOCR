import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.routers.compute import router as compute_router
from app.routers.export import router as export_router
from app.routers.pdf import router as pdf_router
from app.routers.history import router as history_router
from app.routers.ocr import router as ocr_router
from app.routers.settings import router as settings_router
from app.services.db import init_db
from app.services.model_manager import ModelManager


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    """每次请求动态读取 CORS 配置，支持设置热更新。"""

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        origins = settings.cors_origin_list
        origin = request.headers.get("origin", "")

        is_allowed = not origin or origin in origins

        if request.method == "OPTIONS":
            response = Response(status_code=200)
        else:
            response = await call_next(request)

        if is_allowed and origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-ID, X-Admin-Token"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


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
app.add_middleware(DynamicCORSMiddleware)
app.include_router(ocr_router)
app.include_router(compute_router)
app.include_router(export_router)
app.include_router(pdf_router)
app.include_router(history_router)
app.include_router(settings_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
