import asyncio
import gc
import math
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal

from PIL import Image

from app.config import get_settings


Status = Literal["loading", "ready", "error", "unloaded"]
Device = Literal["cuda", "cpu"]
ProgressCallback = Callable[[int, str], None]


@dataclass
class OCRPrediction:
    latex: str
    inference_time_ms: int
    variant: str = "default"


class BaseOCREngine(ABC):
    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self.settings = get_settings()
        self.status: Status = "unloaded"
        self.requested_device = self.settings.app_device
        self.device: Device = "cpu"
        self.message = "model is not loaded"
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

    def weights_exist(self) -> bool:
        return True

    def download_sync(self, progress_cb: ProgressCallback | None = None) -> None:
        if progress_cb:
            progress_cb(100, "model weights are already available")

    async def ensure_weights_async(self, progress_cb: ProgressCallback | None = None) -> None:
        if self.weights_exist():
            if progress_cb:
                progress_cb(100, "model weights are already available")
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.download_sync, progress_cb)

    async def load_async(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.load_sync)

    @abstractmethod
    def load_sync(self) -> None:
        ...

    def status_payload(self) -> dict:
        info = self._torch_cuda_info()
        return {
            "status": self.status,
            "requested_device": self.requested_device,
            "device": self.device,
            "message": self.message,
            **info,
        }

    async def predict(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        if self.status != "ready" or self._model is None:
            raise RuntimeError("model is not ready")
        async with self._lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._predict_sync, image, variant)

    @abstractmethod
    def _predict_sync(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        ...

    def unload(self) -> None:
        self._model = None
        self.status = "unloaded"
        self.message = "model is unloaded"
        gc.collect()
        self._clear_cuda_cache()

    def _clear_cuda_cache(self) -> None:
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _handle_oom(self, exc: Exception) -> None:
        self.status = "error"
        self.message = f"GPU 内存不足: {exc}"
        self._model = None
        gc.collect()
        self._clear_cuda_cache()


HF_MIRROR = "https://hf-mirror.com"
_env_lock = __import__('threading').Lock()


def _hf_download_with_mirror(repo_id: str, local_dir: str, progress_cb: ProgressCallback | None = None) -> None:
    from requests.exceptions import ConnectionError as ReqConnectionError

    with _env_lock:
        original = os.environ.get("HF_ENDPOINT")
    try:
        if progress_cb:
            progress_cb(10, f"trying official HuggingFace for {repo_id}")
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=repo_id, local_dir=local_dir, local_dir_use_symlinks=False)
    except (ReqConnectionError, OSError):
        if progress_cb:
            progress_cb(20, f"official failed, using mirror {HF_MIRROR}")
        with _env_lock:
            os.environ["HF_ENDPOINT"] = HF_MIRROR
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=repo_id, local_dir=local_dir, local_dir_use_symlinks=False)
    finally:
        with _env_lock:
            if original is not None:
                os.environ["HF_ENDPOINT"] = original
            elif "HF_ENDPOINT" in os.environ:
                del os.environ["HF_ENDPOINT"]


class Pix2TextEngine(BaseOCREngine):
    MODEL_VERSION = "1.1"

    def __init__(self, model_id: str = "pix2text") -> None:
        super().__init__(model_id=model_id)
        self._hf_model_id: str | None = None
        self._local_model_id: str | None = None

    def _resolve_model_info(self) -> None:
        from pix2text.consts import AVAILABLE_MODELS
        info = AVAILABLE_MODELS.get_info(self.settings.p2t_mfr_model, 'onnx')
        self._hf_model_id = info['hf_model_id']
        self._local_model_id = info['local_model_id']

    def _model_dir(self) -> Path:
        from pix2text.utils import data_dir
        return Path(data_dir()) / self.MODEL_VERSION / self._local_model_id

    def weights_exist(self) -> bool:
        self._resolve_model_info()
        model_dir = self._model_dir()
        if not model_dir.exists():
            return False
        return any(model_dir.glob('**/[!.]*'))

    def download_sync(self, progress_cb: ProgressCallback | None = None) -> None:
        self._resolve_model_info()
        model_dir = self._model_dir()
        if model_dir.exists() and any(model_dir.glob('**/[!.]*')):
            if progress_cb:
                progress_cb(100, "pix2text model already downloaded")
            return
        if progress_cb:
            progress_cb(5, f"downloading {self._hf_model_id}")
        _hf_download_with_mirror(self._hf_model_id, str(model_dir), progress_cb)
        if not any(model_dir.glob('**/[!.]*')):
            raise RuntimeError(f"P2T model directory is empty after download: {model_dir}")
        if progress_cb:
            progress_cb(100, "pix2text model downloaded")

    def load_sync(self) -> None:
        self.status = "loading"
        self.message = "model is loading"
        try:
            self.device = self._resolve_device()
            self._resolve_model_info()
            from pix2text.latex_ocr import LatexOCR

            model_dir = str(self._model_dir())

            more_model_configs = {}
            if self.device == 'cuda':
                try:
                    import onnxruntime
                    available = onnxruntime.get_available_providers()
                    if 'CUDAExecutionProvider' in available:
                        more_model_configs['provider'] = 'CUDAExecutionProvider'
                    else:
                        self.message = "onnxruntime-gpu not installed, using CPU"
                except Exception:
                    pass

            latex_ocr = LatexOCR(
                model_name=self.settings.p2t_mfr_model,
                model_backend='onnx',
                model_dir=model_dir,
                more_model_configs=more_model_configs or None,
            )
            self._model = latex_ocr
            self.status = "ready"
            self.message = f"{self.model_id} loaded on {self.device}"
        except Exception as exc:
            self.status = "error"
            self.message = str(exc)
            self._model = None

    def _predict_sync(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        started = time.perf_counter()
        try:
            result = self._model.recognize(image)
            latex = result.get('text', '') if isinstance(result, dict) else str(result)
            return OCRPrediction(
                latex=latex.strip(),
                inference_time_ms=int((time.perf_counter() - started) * 1000),
                variant=variant,
            )
        except Exception as exc:
            if "out of memory" in str(exc).lower() or "cuda" in str(exc).lower():
                self._handle_oom(exc)
            raise


class LatexOCREngine(BaseOCREngine):
    def __init__(self) -> None:
        super().__init__(model_id="latex_ocr")
        settings = get_settings()
        self.checkpoint = str(settings.latex_ocr_checkpoint) if settings.latex_ocr_checkpoint else None
        self.repo_id = settings.latex_ocr_repo_id
        self._no_resize = True

    def _pix2tex_package_root(self) -> Path:
        import pix2tex
        return Path(pix2tex.__file__).resolve().parent / "model"

    def _pix2tex_weights_path(self) -> Path:
        if self.checkpoint:
            return Path(self.checkpoint).expanduser().resolve()
        return self._pix2tex_package_root() / "checkpoints" / "weights.pth"

    def _pix2tex_resizer_path(self) -> Path:
        return self._pix2tex_package_root() / "checkpoints" / "image_resizer.pth"

    def _checkpoint_arg(self, weights_path: Path) -> str:
        default_path = self._pix2tex_package_root() / "checkpoints" / "weights.pth"
        if weights_path == default_path:
            return "checkpoints/weights.pth"
        return str(weights_path)

    def _repo_dir(self) -> Path:
        return self.settings.model_dir / "latex_ocr"

    def _repo_weights_path(self) -> Path:
        return self._repo_dir() / "weights.pth"

    def weights_exist(self) -> bool:
        if self.checkpoint:
            return Path(self.checkpoint).expanduser().exists()
        if self.repo_id:
            return self._repo_weights_path().exists()
        return self._pix2tex_weights_path().exists()

    def download_sync(self, progress_cb: ProgressCallback | None = None) -> None:
        if self.checkpoint:
            if self.weights_exist():
                if progress_cb:
                    progress_cb(100, "latex_ocr checkpoint already exists")
                return
            raise FileNotFoundError(f"LATEX_OCR_CHECKPOINT does not exist: {self.checkpoint}")
        if self.repo_id:
            if progress_cb:
                progress_cb(5, "downloading latex_ocr snapshot")
            _hf_download_with_mirror(self.repo_id, str(self._repo_dir()), progress_cb)
            if not self._repo_weights_path().exists():
                raise FileNotFoundError(f"latex_ocr snapshot downloaded but weights.pth was not found in {self._repo_dir()}")
            self.checkpoint = str(self._repo_weights_path())
            if progress_cb:
                progress_cb(100, "latex_ocr snapshot downloaded")
            return
        if self._pix2tex_weights_path().exists():
            if progress_cb:
                progress_cb(100, "using built-in pix2tex weights")
            return
        raise RuntimeError("LaTeX_OCR weights not found")

    def load_sync(self) -> None:
        if not self.checkpoint and self.repo_id and self._repo_weights_path().exists():
            self.checkpoint = str(self._repo_weights_path())
        if not self.checkpoint and self._pix2tex_weights_path().exists():
            self.checkpoint = str(self._pix2tex_weights_path())
        if not self.checkpoint:
            self.status = "error"
            self.message = "LaTeX_OCR weights not found"
            self._model = None
            return
        self.status = "loading"
        self.message = "model is loading"
        try:
            self.device = self._resolve_device()
            os.environ.setdefault("TORCH_HOME", str(self.settings.model_dir))
            from munch import Munch
            from pix2tex.cli import LatexOCR

            weights_path = self._pix2tex_weights_path()
            if not weights_path.exists():
                raise FileNotFoundError(f"LaTeX_OCR weights not found at: {weights_path}")

            resizer_path = self._pix2tex_resizer_path()
            self._no_resize = not resizer_path.exists()
            args = Munch({
                "config": "settings/config.yaml",
                "checkpoint": self._checkpoint_arg(weights_path),
                "no_cuda": self.device == "cpu",
                "no_resize": self._no_resize,
            })
            self._model = LatexOCR(args)
            self.status = "ready"
            self.message = f"latex_ocr loaded on {self.device}"
        except Exception as exc:
            self.status = "error"
            self.message = str(exc)
            self._model = None

    def _fallback_resize_and_pad(self, image: Image.Image) -> Image.Image:
        max_w, max_h = 672, 192
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
        canvas.paste(image, ((max_w - new_w) // 2, (max_h - new_h) // 2))
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
        except Exception as exc:
            if "out of memory" in str(exc).lower() or "cuda" in str(exc).lower():
                self._handle_oom(exc)
            raise
        finally:
            self._clear_cuda_cache()


class UniEquationEngine(BaseOCREngine):
    def __init__(self) -> None:
        super().__init__(model_id="uni_equation")
        self.processor = None
        self.tokenizer = None
        self.local_path: str | None = self.settings.uni_equation_checkpoint
        self.repo_id = self.settings.uni_equation_repo_id or self.settings.uni_equation_model_name

    def _repo_dir(self) -> Path:
        return self.settings.model_dir / "uni_equation"

    def _model_source(self) -> str | None:
        if self.local_path:
            return str(Path(self.local_path).expanduser())
        repo_dir = self._repo_dir()
        if repo_dir.exists():
            for f in repo_dir.iterdir():
                if f.name in self.MODEL_WEIGHT_FILES:
                    return str(repo_dir)
        return self.repo_id

    MODEL_WEIGHT_FILES = {'pytorch_model.bin', 'model.safetensors', 'tf_model.h5', 'model.ckpt.index', 'flax_model.msgpack'}

    def weights_exist(self) -> bool:
        if self.local_path:
            return Path(self.local_path).expanduser().exists()
        repo_dir = self._repo_dir()
        if not repo_dir.exists():
            return False
        for f in repo_dir.iterdir():
            if f.name in self.MODEL_WEIGHT_FILES:
                return True
        return False

    def download_sync(self, progress_cb: ProgressCallback | None = None) -> None:
        if self.local_path:
            if self.weights_exist():
                if progress_cb:
                    progress_cb(100, "uni_equation checkpoint already exists")
                return
            raise FileNotFoundError(f"UNI_EQUATION_CHECKPOINT does not exist: {self.local_path}")
        if not self.repo_id:
            raise RuntimeError("UNI_EQUATION_REPO_ID or UNI_EQUATION_MODEL_NAME must be configured")
        repo_dir = self._repo_dir()
        if repo_dir.exists() and not self.weights_exist():
            import shutil
            shutil.rmtree(str(repo_dir), ignore_errors=True)
        if progress_cb:
            progress_cb(5, "downloading uni_equation snapshot")
        _hf_download_with_mirror(self.repo_id, str(repo_dir), progress_cb)
        if progress_cb:
            progress_cb(100, "uni_equation snapshot downloaded")

    def load_sync(self) -> None:
        self.status = "loading"
        self.message = "model is loading"
        try:
            self.device = self._resolve_device()
            model_name = self._model_source()
            if not model_name:
                raise RuntimeError("UNI_EQUATION_REPO_ID or UNI_EQUATION_CHECKPOINT must be configured")

            try:
                import torch
                from transformers import AutoProcessor, VisionEncoderDecoderModel
            except Exception as exc:
                raise RuntimeError("Uni-Equation requires: pip install transformers accelerate") from exc

            self.processor = AutoProcessor.from_pretrained(model_name, cache_dir=str(self.settings.model_dir))
            self._model = VisionEncoderDecoderModel.from_pretrained(model_name, cache_dir=str(self.settings.model_dir))
            self._model.to(self.device)
            self._model.eval()
            self.tokenizer = getattr(self.processor, "tokenizer", None)
            self.status = "ready"
            self.message = f"uni_equation loaded on {self.device}"
        except Exception as exc:
            self.status = "error"
            self.message = str(exc)
            self._model = None
            self.processor = None
            self.tokenizer = None

    def unload(self) -> None:
        self._model = None
        self.processor = None
        self.tokenizer = None
        self.status = "unloaded"
        self.message = "model is unloaded"
        gc.collect()
        self._clear_cuda_cache()

    def _predict_sync(self, image: Image.Image, variant: str = "default") -> OCRPrediction:
        started = time.perf_counter()
        inputs = None
        output_ids = None
        try:
            import torch

            rgb = image.convert("RGB")
            inputs = self.processor(images=rgb, return_tensors="pt")
            inputs = {key: value.to(self.device) for key, value in inputs.items()}
            with torch.inference_mode():
                output_ids = self._model.generate(**inputs)
            decoder = self.tokenizer or self.processor
            latex = decoder.batch_decode(output_ids, skip_special_tokens=True)[0]
            return OCRPrediction(
                latex=str(latex).strip(),
                inference_time_ms=int((time.perf_counter() - started) * 1000),
                variant=variant,
            )
        except Exception as exc:
            if "out of memory" in str(exc).lower() or "cuda" in str(exc).lower():
                self._handle_oom(exc)
            raise
        finally:
            del inputs, output_ids
            self._clear_cuda_cache()
