from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from starlette.responses import StreamingResponse

from app.config import get_settings
from app.routers.common import get_model_manager, success
from app.services.db import AsyncSessionLocal, create_history
from app.services.preprocess import enhance_formula_image, make_thumbnail_data_url, preprocess_image, read_image

router = APIRouter(prefix="/api", tags=["ocr"])


FALLBACK_MODEL_ID = "pix2tex"


def _brace_delta(latex: str) -> int:
    return latex.count("{") - latex.count("}")


def _latex_score(latex: str) -> int:
    text = latex.strip()
    score = 1000
    length = len(text)
    score -= length
    score -= abs(_brace_delta(text)) * 300
    if "\\begin{array}" in text or "\\begin{matrix}" in text:
        score -= 450
    if length > 260:
        score -= 400
    if length > 600:
        score -= 1000
    if text.count("\\hat") + text.count("\\tilde") > 6:
        score -= 300
    if "\\frac" in text:
        score += 80
    if "\\sqrt" in text:
        score += 60
    return score


def _is_suspicious_latex(latex: str) -> bool:
    text = latex.strip()
    return (
        not text
        or abs(_brace_delta(text)) > 0
        or len(text) > 260
        or "\\begin{array}" in text
        or "\\begin{matrix}" in text
        or text.count("\\hat") + text.count("\\tilde") > 8
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
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Image must be smaller than {settings.max_upload_mb}MB")

    original_image = read_image(file_bytes)
    processed = preprocess_image(file_bytes)
    processed_data_url = processed.data_url if settings.return_preprocessed_image else None
    manager = get_model_manager(request)

    async def run_pipeline(engine):
        predictions = [await engine.predict(original_image, "original")]
        if preprocess and _is_suspicious_latex(predictions[0].latex):
            predictions.append(await engine.predict(processed.image, "preprocessed"))
            enhanced_image = enhance_formula_image(original_image)
            predictions.append(await engine.predict(enhanced_image, "enhanced"))
        prediction = max(predictions, key=lambda item: _latex_score(item.latex))
        return engine.model_id, prediction

    try:
        selected_model_id, prediction = await manager.predict(model_id, run_pipeline)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail={"message": str(exc), "fallback_model_id": FALLBACK_MODEL_ID}) from exc

    thumbnail = make_thumbnail_data_url(file_bytes)
    async with AsyncSessionLocal() as session:
        await create_history(session, prediction.latex, thumbnail)

    return success({
        "latex": prediction.latex,
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


@router.post("/recognize")
async def recognize(
    request: Request,
    file: UploadFile = File(...),
    preprocess: bool = Form(True),
    model_id: str | None = Form(None),
):
    return await _recognize_with_model(request, file, preprocess, model_id)
