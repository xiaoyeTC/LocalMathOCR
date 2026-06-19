from fastapi import HTTPException, Request


def success(data, message: str = "success", code: int = 200) -> dict:
    return {"code": code, "message": message, "data": data}


def get_model_manager(request: Request):
    manager = getattr(request.app.state, "model_manager", None)
    if manager is None:
        raise HTTPException(status_code=503, detail="OCR model manager is not initialized")
    return manager
