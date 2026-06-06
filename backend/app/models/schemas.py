from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 200
    message: str = "success"
    data: T


class ModelStatus(BaseModel):
    status: Literal["loading", "ready", "error"]
    device: Literal["cuda", "cpu"]
    message: str


class RecognizeResult(BaseModel):
    latex: str
    inference_time_ms: int
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
