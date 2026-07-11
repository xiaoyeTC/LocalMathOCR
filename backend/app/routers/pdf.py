import asyncio
import base64
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.routers.common import success

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

MAX_PAGES = 50
MAX_DPI = 600
_pdf_sessions: dict[str, bytes] = {}


@router.post("/info")
async def pdf_info(file: UploadFile = File(...)):
    settings = get_settings()
    if not settings.enable_pdf_recognition:
        raise HTTPException(status_code=501, detail="PDF 识别未启用")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    settings = get_settings()
    chunks = []
    total = 0
    max_bytes = settings.max_upload_mb * 1024 * 1024 * 5
    while chunk := await file.read(8192):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail=f"PDF 文件过大（最大 {settings.max_upload_mb * 5}MB）")
        chunks.append(chunk)
    file_bytes = b"".join(chunks)

    loop = asyncio.get_running_loop()

    def _open_and_count():
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total = len(doc)
        doc.close()
        return total

    try:
        total_pages = await loop.run_in_executor(None, _open_and_count)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("PDF open failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="无法打开 PDF 文件，请检查文件是否损坏") from exc

    if total_pages > MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"PDF 页数过多（{total_pages} 页，最大 {MAX_PAGES} 页）")

    pdf_id = str(uuid.uuid4())
    _pdf_sessions[pdf_id] = file_bytes

    if len(_pdf_sessions) > 50:
        oldest = next(iter(_pdf_sessions))
        del _pdf_sessions[oldest]

    return success({"total_pages": total_pages, "pdf_id": pdf_id})


@router.post("/render")
async def render_page(body: dict):
    pdf_id = body.get("pdf_id", "")
    pdf_base64 = body.get("pdf_base64", "")
    page = body.get("page", 1)
    dpi = body.get("dpi", get_settings().pdf_dpi)

    if not isinstance(page, int) or page < 1:
        raise HTTPException(status_code=400, detail="page 必须为正整数")
    if not isinstance(dpi, (int, float)) or dpi < 1:
        raise HTTPException(status_code=400, detail="dpi 必须为正数")
    dpi = int(dpi)
    if dpi > MAX_DPI:
        dpi = MAX_DPI

    if pdf_id and pdf_id in _pdf_sessions:
        pdf_bytes = _pdf_sessions[pdf_id]
    elif pdf_base64:
        try:
            pdf_bytes = base64.b64decode(pdf_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="pdf_base64 无效")
    else:
        raise HTTPException(status_code=400, detail="pdf_id 或 pdf_base64 不能为空")

    loop = asyncio.get_running_loop()

    def _render():
        import fitz
        doc = None
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            if page < 1 or page > len(doc):
                raise ValueError(f"页码超出范围: {page} (总页数: {len(doc)})")
            pdf_page = doc[page - 1]
            zoom = dpi / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = pdf_page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            return pix.width, pix.height, base64.b64encode(img_bytes).decode("utf-8")
        finally:
            if doc:
                doc.close()

    try:
        width, height, img_b64 = await asyncio.wait_for(
            loop.run_in_executor(None, _render),
            timeout=30,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="PDF 页面渲染超时，请降低 DPI 后重试")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("PDF render failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="PDF 渲染失败，请降低 DPI 后重试") from exc

    return success({
        "page": page,
        "width": width,
        "height": height,
        "image_base64": f"data:image/png;base64,{img_b64}",
    })
