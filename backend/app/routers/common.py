from fastapi import HTTPException, Request


def success(data, message: str = "success", code: int = 200) -> dict:
    return {"code": code, "message": message, "data": data}


def get_ocr_engine(request: Request):
    engine = getattr(request.app.state, "ocr_engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="OCR engine is not initialized")
    return engine
