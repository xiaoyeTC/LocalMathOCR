import asyncio
import gc
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps

from app.config import get_settings


Status = Literal["loading", "ready", "error"]
Device = Literal["cuda", "cpu"]


@dataclass
class OCRPrediction:
    latex: str
    inference_time_ms: int
    variant: str = "default"


class Pix2TexEngine:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.status: Status = "loading"
        self.requested_device = self.settings.app_device
        self.device: Device = "cpu"
        self.message = "model is loading"
        self._model = None
        self._lock = asyncio.Lock()

    def _torch_cuda_info(self) -> dict:
        try:
            import torch

            cuda_available = torch.cuda.is_available()
            return {
                "torch_version": torch.__version__,
                "torch_cuda_version": torch.version.cuda,
                "cuda_available": cuda_available,
                "cuda_device_count": torch.cuda.device_count(),
                "cuda_device_name": torch.cuda.get_device_name(0) if cuda_available else None,
            }
        except Exception as exc:
            return {
                "torch_version": None,
                "torch_cuda_version": None,
                "cuda_available": False,
                "cuda_device_count": 0,
                "cuda_device_name": None,
                "cuda_error": str(exc),
            }

    def _resolve_device(self) -> Device:
        forced = self.settings.app_device
        info = self._torch_cuda_info()
        cuda_available = bool(info["cuda_available"])
        if forced == "cpu":
            return "cpu"
        if forced == "cuda" and not cuda_available:
            raise RuntimeError(
                "GPU mode was requested, but PyTorch CUDA is unavailable. "
                f"torch={info['torch_version']}, torch_cuda={info['torch_cuda_version']}, "
                f"cuda_device_count={info['cuda_device_count']}. "
                "Install CUDA-enabled PyTorch, then restart start.bat."
            )
        return "cuda" if cuda_available else "cpu"

    async def load_async(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.load_sync)

    def status_payload(self) -> dict:
        info = self._torch_cuda_info()
        return {
            "status": self.status,
            "requested_device": self.requested_device,
            "device": self.device,
            "message": self.message,
            **info,
        }

    def _pix2tex_weights_path(self) -> Path:
        import pix2tex

        return Path(pix2tex.__file__).resolve().parent / "model" / "checkpoints" / "weights.pth"

    def _pix2tex_resizer_path(self) -> Path:
        import pix2tex

        return Path(pix2tex.__file__).resolve().parent / "model" / "checkpoints" / "image_resizer.pth"

    def _missing_model_message(self, weights_path: Path) -> str:
        return (
            "pix2tex model file is missing. "
            f"Please download weights.pth from https://github.com/lukas-blecher/LaTeX-OCR/releases/download/v0.0.1/weights.pth "
            f"and put it at: {weights_path}. "
            "Optional image_resizer.pth is disabled to avoid GitHub download timeout."
        )

    def load_sync(self) -> None:
        self.status = "loading"
        try:
            self.device = self._resolve_device()
            os.environ.setdefault("TORCH_HOME", str(self.settings.model_dir))
            from munch import Munch
            from pix2tex.cli import LatexOCR

            weights_path = self._pix2tex_weights_path()
            if not weights_path.exists():
                raise FileNotFoundError(self._missing_model_message(weights_path))

            resizer_path = self._pix2tex_resizer_path()
            no_resize = not resizer_path.exists()
            args = Munch({
                "config": "settings/config.yaml",
                "checkpoint": "checkpoints/weights.pth",
                "no_cuda": self.device == "cpu",
                "no_resize": no_resize,
            })
            self._model = LatexOCR(args)
            self._no_resize = no_resize
            self.status = "ready"
            if no_resize:
                self.message = (
                    f"pix2tex loaded on {self.device}; image_resizer.pth is missing, "
                    "so recognition accuracy may be lower."
                )
            else:
                self.message = f"pix2tex loaded on {self.device}; image_resizer enabled"
        except Exception as exc:
            self.status = "error"
            self.message = str(exc)
            self._model = None

    async def predict(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        if self.status != "ready" or self._model is None:
            raise RuntimeError("model is not ready")
        async with self._lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._predict_sync, image, variant)

    def _fallback_resize_and_pad(self, image: Image.Image) -> Image.Image:
        """Approximate pix2tex resize+pad when image_resizer.pth is missing.

        Uses the model config dimensions if available, otherwise safe defaults.
        The resizer model normally predicts optimal (max_w, max_h) per image.
        Without it we use the training-default max dimensions so the transformer
        gets properly-sized patches.
        """
        max_w, max_h = 672, 192  # safe defaults for pix2tex default model
        try:
            cfg = getattr(self._model, "args", None)
            if cfg is not None:
                dims = getattr(cfg, "max_dimensions", None)
                if dims is not None:
                    max_w, max_h = int(dims[1]), int(dims[0])
        except Exception:
            pass

        w, h = image.size
        if w == 0 or h == 0:
            return image

        ratio = min(max_w / w, max_h / h)
        if ratio < 1:
            new_w, new_h = math.floor(w * ratio), math.floor(h * ratio)
        else:
            new_w, new_h = w, h
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (max_w, max_h), "white")
        off_x = (max_w - new_w) // 2
        off_y = (max_h - new_h) // 2
        canvas.paste(image, (off_x, off_y))
        return canvas

    def _predict_sync(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        started = time.perf_counter()
        try:
            model_input = image
            if self._no_resize and self._model is not None:
                model_input = self._fallback_resize_and_pad(image)
            latex = self._model(model_input)
            if isinstance(latex, (list, tuple)):
                latex = latex[0]
            return OCRPrediction(
                latex=str(latex).strip(),
                inference_time_ms=int((time.perf_counter() - started) * 1000),
                variant=variant,
            )
        finally:
            gc.collect()
            try:
                import torch

                if self.device == "cuda" and torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
