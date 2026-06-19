import base64
import io

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import get_settings
from app.routers.common import success

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


@router.post("/info")
async def pdf_info(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    file_bytes = await file.read()
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_bytes * 5:
        raise HTTPException(status_code=413, detail=f"PDF 文件过大（最大 {settings.max_upload_mb * 5}MB）")

    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法打开 PDF: {exc}") from exc

    total_pages = len(doc)
    doc.close()

    pdf_base64 = base64.b64encode(file_bytes).decode("utf-8")
    return success({"total_pages": total_pages, "pdf_base64": pdf_base64})


@router.post("/render")
async def render_page(body: dict):
    pdf_base64 = body.get("pdf_base64", "")
    page = body.get("page", 1)
    dpi = body.get("dpi", 200)

    if not pdf_base64:
        raise HTTPException(status_code=400, detail="pdf_base64 不能为空")

    try:
        pdf_bytes = base64.b64decode(pdf_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="pdf_base64 无效")

    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法打开 PDF: {exc}") from exc

    if page < 1 or page > len(doc):
        doc.close()
        raise HTTPException(status_code=400, detail=f"页码超出范围: {page} (总页数: {len(doc)})")

    pdf_page = doc[page - 1]
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = pdf_page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()

    img_base64 = base64.b64encode(img_bytes).decode("utf-8")
    return success({
        "page": page,
        "width": pix.width,
        "height": pix.height,
        "image_base64": f"data:image/png;base64,{img_base64}",
    })
