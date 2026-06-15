import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# 使用绝对路径定位 .env，确保无论 CWD 在哪都能正确读取
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    app_name: str = "LocalMathOCR"
    app_device: Literal["auto", "cpu", "cuda"] = "auto"
    model_dir: Path = Path("./models")
    database_url: str = "sqlite+aiosqlite:///./data/history.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
    max_upload_mb: int = 10
    return_preprocessed_image: bool = Field(default=True, alias="preprocess")
    default_model_id: str = "pix2text"
    enable_pix2text: bool = True
    enable_latex_ocr: bool = True
    enable_uni_equation: bool = False
    latex_ocr_checkpoint: Path | None = None
    uni_equation_model_name: str = "wanderkid/unimernet"
    uni_equation_checkpoint: str | None = None
    max_loaded_models: int = Field(default=1, ge=1)
    preload_models: str = "pix2text"
    model_download_timeout_sec: int = 1800
    pix2tex_weights_url: str = "https://github.com/lukas-blecher/LaTeX-OCR/releases/download/v0.0.1/weights.pth"
    latex_ocr_repo_id: str | None = None
    uni_equation_repo_id: str | None = None
    p2t_mfr_model: str = "mfr-1.5"
    hf_endpoint: str = ""
    enable_formula_preprocessing: bool = False
    admin_password: str = ""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def preload_model_list(self) -> list[str]:
        models = [item.strip() for item in self.preload_models.split(",") if item.strip()]
        return models or [self.default_model_id]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    if settings.hf_endpoint:
        os.environ["HF_ENDPOINT"] = settings.hf_endpoint
    elif "HF_ENDPOINT" in os.environ:
        del os.environ["HF_ENDPOINT"]
    return settings


def clear_settings_cache() -> None:
    """清除 settings 缓存，使下次 get_settings() 重新读取 .env。"""
    get_settings.cache_clear()
