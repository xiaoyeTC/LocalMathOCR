import hashlib
import hmac
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings, clear_settings_cache, _ENV_FILE
from app.routers.common import success

router = APIRouter(prefix="/api", tags=["settings"])

_admin_tokens: dict[str, float] = {}
TOKEN_TTL = 3600


def _make_token(password: str, session_id: str) -> str:
    return hmac.new(password.encode(), session_id.encode(), hashlib.sha256).hexdigest()


def _purge_expired_tokens() -> None:
    """主动清理过期的管理员 token，防止字典无限增长。"""
    now = time.time()
    expired = [t for t, ts in _admin_tokens.items() if now - ts > TOKEN_TTL]
    for t in expired:
        del _admin_tokens[t]


def _verify_admin(request: Request) -> bool:
    settings = get_settings()
    if not settings.admin_password:
        return False
    token = request.headers.get("X-Admin-Token", "")
    session_id = request.headers.get("X-Session-ID", "default")
    expected = _make_token(settings.admin_password, session_id)
    if not hmac.compare_digest(token, expected):
        return False
    stored_time = _admin_tokens.get(token)
    if stored_time and time.time() - stored_time > TOKEN_TTL:
        del _admin_tokens[token]
        return False
    return True


USER_SETTINGS = {"preprocess", "enable_formula_preprocessing", "default_model_id"}

ADMIN_SETTINGS = {
    "app_device", "enable_pix2text", "enable_latex_ocr", "enable_uni_equation",
    "preload_models", "max_loaded_models", "model_download_timeout_sec",
    "p2t_mfr_model", "hf_endpoint", "cors_origins", "database_url", "model_dir",
}


@router.post("/auth/admin")
async def admin_login(request: Request):
    settings = get_settings()
    body = await request.json()
    password = body.get("password", "")
    session_id = request.headers.get("X-Session-ID", "default")

    if not settings.admin_password:
        return success({"token": "", "message": "管理员密码未设置，所有设置可自由修改"})
    if password != settings.admin_password:
        raise HTTPException(status_code=401, detail="密码错误")

    _purge_expired_tokens()
    token = _make_token(settings.admin_password, session_id)
    _admin_tokens[token] = time.time()
    return success({"token": token})


@router.get("/settings")
async def get_all_settings(request: Request):
    settings = get_settings()
    is_admin = _verify_admin(request)

    data = {
        "preprocess": settings.return_preprocessed_image,
        "enable_formula_preprocessing": settings.enable_formula_preprocessing,
        "default_model_id": settings.default_model_id,
    }

    if is_admin:
        data.update({
            "app_device": settings.app_device,
            "enable_pix2text": settings.enable_pix2text,
            "enable_latex_ocr": settings.enable_latex_ocr,
            "enable_uni_equation": settings.enable_uni_equation,
            "preload_models": settings.preload_models,
            "max_loaded_models": settings.max_loaded_models,
            "model_download_timeout_sec": settings.model_download_timeout_sec,
            "p2t_mfr_model": settings.p2t_mfr_model,
            "hf_endpoint": settings.hf_endpoint,
        })

    return success({"settings": data, "is_admin": is_admin, "has_admin_password": bool(settings.admin_password)})


@router.put("/settings")
async def update_settings(request: Request):
    is_admin = _verify_admin(request)
    body = await request.json()

    allowed = set(USER_SETTINGS)
    if is_admin:
        allowed |= ADMIN_SETTINGS

    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid settings to update")

    _purge_expired_tokens()

    env_path = _ENV_FILE
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated_keys: set[str] = set()
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in stripped:
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in updates:
            val = updates[key]
            if isinstance(val, bool):
                lines[i] = f"{key}={'true' if val else 'false'}"
            else:
                lines[i] = f"{key}={val}"
            updated_keys.add(key)

    for key, val in updates.items():
        if key not in updated_keys:
            if isinstance(val, bool):
                lines.append(f"{key}={'true' if val else 'false'}")
            else:
                lines.append(f"{key}={val}")

    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    clear_settings_cache()

    return success({"updated": list(updates.keys())})
