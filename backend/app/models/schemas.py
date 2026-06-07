from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: T


class ModelStatus(BaseModel):
    status: Literal["downloading", "ready", "unavailable"]
    device: Literal["cuda", "cpu"]
    message: str
    progress: int = 0
    active_model_id: str | None = None


class OcrModelMetadata(BaseModel):
    id: str
    display_name: str
    description: str
    vram_requirement: str
    strengths: list[str]
    enabled: bool = True
    status: Literal["downloading", "ready", "unavailable"] = "unavailable"
    progress: int = 0
    device: Literal["cuda", "cpu"] = "cpu"
    message: str = "model is not initialized"
    active: bool = False
    is_default: bool = False


class RecognizeResult(BaseModel):
    latex: str
    inference_time_ms: int
    variant: str | None = None
    model_id: str | None = None
    preprocessed_image_base64: str | None = None


class HistoryCreate(BaseModel):
    latex: str
    image_base64: str | None = None


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    latex: str
    image_base64: str | None
    created_at: datetime
