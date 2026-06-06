from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

from app.config import get_settings
from app.routers.common import get_ocr_engine, success
from app.services.preprocess import make_thumbnail_data_url, preprocess_image, read_image
from app.services.db import AsyncSessionLocal, create_history

router = APIRouter(prefix="/api", tags=["ocr"])


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


@router.get("/model-status")
async def model_status(request: Request):
    engine = get_ocr_engine(request)
    return success(engine.status_payload())


@router.post("/recognize")
async def recognize(request: Request, file: UploadFile = File(...), preprocess: bool = Form(True)):
    settings = get_settings()
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=400, detail="Only JPG, PNG and WebP images are supported")
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Image must be smaller than {settings.max_upload_mb}MB")

    engine = get_ocr_engine(request)
    if engine.status != "ready":
        raise HTTPException(status_code=503, detail="Local OCR model is still loading")

    original_image = read_image(file_bytes)
    processed = preprocess_image(file_bytes)
    processed_data_url = processed.data_url if settings.return_preprocessed_image else None

    # Always try original first; only use preprocessed if result looks suspicious
    predictions = [await engine.predict(original_image, "original")]
    if preprocess and _is_suspicious_latex(predictions[0].latex):
        predictions.append(await engine.predict(processed.image, "preprocessed"))

    prediction = max(predictions, key=lambda item: _latex_score(item.latex))
    thumbnail = make_thumbnail_data_url(file_bytes)
    async with AsyncSessionLocal() as session:
        await create_history(session, prediction.latex, thumbnail)

    return success({
        "latex": prediction.latex,
        "inference_time_ms": prediction.inference_time_ms,
        "variant": prediction.variant,
        "preprocessed_image_base64": processed_data_url,
    })
