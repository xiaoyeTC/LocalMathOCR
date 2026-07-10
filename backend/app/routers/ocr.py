import asyncio
import re

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from starlette.responses import StreamingResponse

from app.config import get_settings
from app.routers.common import get_model_manager, success
from app.services.db import AsyncSessionLocal, create_history
from app.services.postprocess import post_processor
from app.services.formula_preprocessor import FormulaPreprocessor, FormulaPreprocessConfig
from app.services.preprocess import enhance_formula_image, make_thumbnail_data_url, preprocess_image, read_image, validate_image_magic

router = APIRouter(prefix="/api", tags=["ocr"])


FALLBACK_MODEL_ID = "pix2text"
_SESSION_ID_RE = re.compile(r'^[a-zA-Z0-9_-]+$')

# LaTeX scoring thresholds
_SCORE_BASE = 1000
_SCORE_BRACE_PENALTY = 300
_SCORE_ARRAY_PENALTY = 450
_SCORE_LONG_PENALTY = 400
_SCORE_VERY_LONG_PENALTY = 1000
_SCORE_HAT_LIMIT = 6
_SCORE_HAT_PENALTY = 300
_SCORE_FRAC_BONUS = 80
_SCORE_SQRT_BONUS = 60
_SUSPICIOUS_LENGTH = 260
_SUSPICIOUS_HAT_LIMIT = 8


def _brace_delta(latex: str) -> int:
    return latex.count("{") - latex.count("}")


def _latex_score(latex: str) -> int:
    text = latex.strip()
    score = _SCORE_BASE
    length = len(text)
    score -= length
    score -= abs(_brace_delta(text)) * _SCORE_BRACE_PENALTY
    if "\\begin{array}" in text or "\\begin{matrix}" in text:
        score -= _SCORE_ARRAY_PENALTY
    if length > _SUSPICIOUS_LENGTH:
        score -= _SCORE_LONG_PENALTY
    if length > _SCORE_VERY_LONG_PENALTY:
        score -= _SCORE_VERY_LONG_PENALTY
    if text.count("\\hat") + text.count("\\tilde") > _SCORE_HAT_LIMIT:
        score -= _SCORE_HAT_PENALTY
    if "\\frac" in text:
        score += _SCORE_FRAC_BONUS
    if "\\sqrt" in text:
        score += _SCORE_SQRT_BONUS
    return score


def _is_suspicious_latex(latex: str) -> bool:
    text = latex.strip()
    return (
        not text
        or abs(_brace_delta(text)) > 0
        or len(text) > _SUSPICIOUS_LENGTH
        or "\\begin{array}" in text
        or "\\begin{matrix}" in text
        or text.count("\\hat") + text.count("\\tilde") > _SUSPICIOUS_HAT_LIMIT
    )


@router.get("/models")
async def models(request: Request):
    manager = get_model_manager(request)
    return success(manager.event_payload())


@router.get("/models/events")
async def model_events(request: Request):
    manager = get_model_manager(request)
    queue = await manager.subscribe()

    async def stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                message = await queue.get()
                yield f"event: models\ndata: {message}\n\n"
        finally:
            manager.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/models/{model_id}/activate")
async def activate_model(request: Request, model_id: str):
    manager = get_model_manager(request)
    try:
        payload = await manager.activate(model_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc
    return success(payload)


@router.get("/model-status")
async def model_status(request: Request, model_id: str | None = None):
    manager = get_model_manager(request)
    return success(manager.status_payload(model_id))


async def _recognize_with_model(
    request: Request,
    file: UploadFile,
    preprocess: bool,
    model_id: str | None,
):
    settings = get_settings()
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WebP images are supported")
    chunks = []
    total = 0
    max_bytes = settings.max_upload_mb * 1024 * 1024
    while chunk := await file.read(8192):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"文件不能超过 {settings.max_upload_mb}MB")
        chunks.append(chunk)
    file_bytes = b"".join(chunks)

    try:
        validate_image_magic(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        original_image = read_image(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    loop = asyncio.get_running_loop()
    processed = await loop.run_in_executor(None, preprocess_image, file_bytes, original_image)
    processed_data_url = processed.data_url if settings.return_preprocessed_image else None
    manager = get_model_manager(request)

    async def run_pipeline(engine):
        predictions = [await engine.predict(original_image, "original")]
        if preprocess and _is_suspicious_latex(predictions[0].latex):
            predictions.append(await engine.predict(processed.image, "preprocessed"))
            enhanced_image = await loop.run_in_executor(None, enhance_formula_image, original_image)
            predictions.append(await engine.predict(enhanced_image, "enhanced"))
        if settings.enable_formula_preprocessing:
            fp = FormulaPreprocessor()
            fp_result = await loop.run_in_executor(None, fp.process, original_image)
            predictions.append(await engine.predict(fp_result, "formula_preprocessed"))
        prediction = max(predictions, key=lambda item: _latex_score(item.latex))
        return engine.model_id, prediction

    try:
        selected_model_id, prediction = await manager.predict(model_id, run_pipeline)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc

    cleaned_latex = post_processor.clean(prediction.latex)

    raw_session = request.headers.get("X-Session-ID", "default")
    session_id = raw_session[:128] if _SESSION_ID_RE.match(raw_session) else "default"
    try:
        thumbnail = await loop.run_in_executor(None, make_thumbnail_data_url, file_bytes, (320, 180), original_image)
        async with AsyncSessionLocal() as session:
            await create_history(session, cleaned_latex, thumbnail, session_id=session_id)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Failed to save history: %s", exc, exc_info=True)

    return success({
        "latex": cleaned_latex,
        "inference_time_ms": prediction.inference_time_ms,
        "variant": prediction.variant,
        "model_id": selected_model_id,
        "preprocessed_image_base64": processed_data_url,
    })


@router.post("/ocr")
async def ocr(
    request: Request,
    file: UploadFile = File(...),
    preprocess: bool = Form(True),
    model_id: str | None = Form(None),
):
    return await _recognize_with_model(request, file, preprocess, model_id)


@router.post("/recognize", deprecated=True)
async def recognize(
    request: Request,
    file: UploadFile = File(...),
    preprocess: bool = Form(True),
    model_id: str | None = Form(None),
):
    return await _recognize_with_model(request, file, preprocess, model_id)
