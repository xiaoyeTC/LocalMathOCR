import asyncio
import gc
import json
from dataclasses import dataclass, field
from typing import Callable, Literal

from app.config import get_settings
from app.services.ocr_engine import BaseOCREngine, LatexOCREngine, Pix2TextEngine, UniEquationEngine


ModelRuntimeState = Literal["downloading", "ready", "unavailable"]


@dataclass(frozen=True)
class ModelMetadata:
    id: str
    display_name: str
    description: str
    vram_requirement: str
    strengths: list[str]


@dataclass
class ModelRuntime:
    metadata: ModelMetadata
    enabled: bool
    factory: Callable[[], BaseOCREngine]
    engine: BaseOCREngine | None = None
    state: ModelRuntimeState = "unavailable"
    progress: int = 0
    message: str = "not initialized"
    device: str = "cpu"
    active: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ModelManager:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.default_model_id = self.settings.default_model_id or "pix2text"
        self.active_model_id: str | None = None
        self._runtimes: dict[str, ModelRuntime] = {}
        self._switch_lock = asyncio.Lock()
        self._predict_lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._register_defaults()
        if self.default_model_id not in self.enabled_model_ids:
            self.default_model_id = "pix2text"

    @property
    def enabled_model_ids(self) -> set[str]:
        return {model_id for model_id, runtime in self._runtimes.items() if runtime.enabled}

    def _register_defaults(self) -> None:
        self.register(
            ModelMetadata(
                id="pix2text",
                display_name="基础版 (Pix2Text)",
                description="🚀 轻量高效，支持 CPU 运行。基于 P2T MFR 模型，适合单行公式和清晰截图。",
                vram_requirement="<1GB",
                strengths=["CPU 友好", "单行公式", "清晰截图", "快速识别"],
            ),
            enabled=self.settings.enable_pix2text,
            factory=lambda: Pix2TextEngine(),
        )
        self.register(
            ModelMetadata(
                id="latex_ocr",
                display_name="高精度版 (LaTeX_OCR)",
                description="🎯 准确率大幅提升。适合包含上下标、希腊字母的常规复杂公式。推荐 GPU 运行。",
                vram_requirement="2GB+",
                strengths=["上下标", "希腊字母", "常规复杂公式", "GPU 推荐"],
            ),
            enabled=self.settings.enable_latex_ocr,
            factory=lambda: LatexOCREngine(),
        )
        self.register(
            ModelMetadata(
                id="uni_equation",
                display_name="专业版 (Uni-Equation)",
                description="🧠 复杂结构克星。专为多层嵌套分数、大型矩阵、物理/化学长公式优化。",
                vram_requirement="6GB+",
                strengths=["嵌套分数", "大型矩阵", "长公式", "物理/化学公式"],
            ),
            enabled=self.settings.enable_uni_equation,
            factory=lambda: UniEquationEngine(),
        )

    def register(self, metadata: ModelMetadata, enabled: bool, factory: Callable[[], BaseOCREngine]) -> None:
        self._runtimes[metadata.id] = ModelRuntime(
            metadata=metadata,
            enabled=enabled,
            factory=factory,
            state="unavailable" if not enabled else "ready",
            progress=0 if not enabled else 100,
            message="未启用" if not enabled else "就绪，点击切换后按需加载",
        )

    async def initialize(self) -> None:
        self._loop = asyncio.get_running_loop()
        for model_id in self.settings.preload_model_list:
            if model_id in self._runtimes and self._runtimes[model_id].enabled:
                try:
                    await self.prepare(model_id)
                except Exception as exc:
                    self._set_unavailable(self._runtimes[model_id], str(exc))
        if self.default_model_id in self.enabled_model_ids:
            try:
                await self.activate(self.default_model_id)
            except Exception as exc:
                self._set_unavailable(self._runtimes[self.default_model_id], str(exc))
        await self.broadcast()

    async def preload_default(self) -> None:
        await self.initialize()

    async def prepare(self, model_id: str) -> None:
        runtime = self._get_runtime(model_id)
        if not runtime.enabled:
            self._set_unavailable(runtime, "未启用")
            return
        async with runtime.lock:
            if runtime.engine is None:
                runtime.engine = runtime.factory()
            if runtime.engine.weights_exist():
                runtime.state = "ready"
                runtime.progress = 100
                runtime.message = "权重已就绪"
                runtime.device = runtime.engine.device
                await self.broadcast()
                return
            runtime.state = "downloading"
            runtime.progress = 0
            runtime.message = "正在下载模型权重"
            await self.broadcast()
            await runtime.engine.ensure_weights_async(self._progress_callback(model_id))
            runtime.state = "ready"
            runtime.progress = 100
            runtime.message = "权重下载完成"
            await self.broadcast()

    async def activate(self, model_id: str | None) -> dict:
        selected_id = model_id or self.active_model_id or self.default_model_id
        runtime = self._get_runtime(selected_id)
        if not runtime.enabled:
            self._set_unavailable(runtime, "未启用")
            raise ValueError(f"Model '{selected_id}' is unavailable")

        async with self._switch_lock:
            async with self._predict_lock:
                if self.active_model_id == selected_id and runtime.engine and runtime.engine.status == "ready":
                    runtime.active = True
                    runtime.state = "ready"
                    runtime.progress = 100
                    await self.broadcast()
                    return self.status_payload()

                old_model_id = self.active_model_id
                if runtime.engine is None:
                    runtime.engine = runtime.factory()

                await self.prepare(selected_id)
                runtime.state = "downloading"
                runtime.message = "正在加载模型到显存"
                runtime.progress = 95
                await self.broadcast()
                await runtime.engine.load_async()
                if runtime.engine.status != "ready":
                    self._set_unavailable(runtime, runtime.engine.message)
                    raise RuntimeError(runtime.engine.message)

                self.active_model_id = selected_id
                for item in self._runtimes.values():
                    item.active = item.metadata.id == selected_id
                runtime.state = "ready"
                runtime.device = runtime.engine.device
                runtime.message = runtime.engine.message

                if old_model_id and old_model_id != selected_id:
                    self._unload_engine(old_model_id)
                self._release_memory()
                await self.broadcast()
                return self.status_payload()

    async def predict(self, model_id: str | None, predict_fn):
        selected_id = model_id or self.active_model_id or self.default_model_id
        if selected_id != self.active_model_id:
            await self.activate(selected_id)
        async with self._predict_lock:
            runtime = self._get_runtime(selected_id)
            if runtime.engine is None or runtime.engine.status != "ready":
                raise RuntimeError(f"Model '{selected_id}' is not ready")
            return await predict_fn(runtime.engine)

    def list_models(self) -> list[dict]:
        return [self._runtime_payload(runtime) for runtime in self._runtimes.values()]

    def status_payload(self, model_id: str | None = None) -> dict:
        selected_id = model_id or self.active_model_id or self.default_model_id
        runtime = self._runtimes.get(selected_id)
        if runtime is None:
            return {"status": "unavailable", "device": "cpu", "message": "model is not registered", "model_id": selected_id}
        return {
            "status": runtime.state,
            "model_id": selected_id,
            "active_model_id": self.active_model_id,
            "device": runtime.device,
            "message": runtime.message,
            "progress": runtime.progress,
        }

    def event_payload(self) -> dict:
        return {
            "active_model_id": self.active_model_id,
            "default_model_id": self.default_model_id,
            "models": self.list_models(),
        }

    async def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=10)
        self._subscribers.add(queue)
        await queue.put(json.dumps(self.event_payload(), ensure_ascii=False))
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    async def broadcast(self) -> None:
        if not self._subscribers:
            return
        message = json.dumps(self.event_payload(), ensure_ascii=False)
        stale: list[asyncio.Queue[str]] = []
        for queue in self._subscribers:
            try:
                if queue.full():
                    queue.get_nowait()
                queue.put_nowait(message)
            except Exception:
                stale.append(queue)
        for queue in stale:
            self.unsubscribe(queue)

    def _progress_callback(self, model_id: str):
        def callback(progress: int, message: str) -> None:
            runtime = self._runtimes.get(model_id)
            if runtime is None:
                return
            runtime.state = "downloading"
            runtime.progress = max(0, min(100, progress))
            runtime.message = message
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(lambda: asyncio.create_task(self.broadcast()))
        return callback

    def _get_runtime(self, model_id: str) -> ModelRuntime:
        runtime = self._runtimes.get(model_id)
        if runtime is None:
            raise ValueError(f"Model '{model_id}' is not registered")
        return runtime

    def _runtime_payload(self, runtime: ModelRuntime) -> dict:
        return {
            **runtime.metadata.__dict__,
            "enabled": runtime.enabled,
            "status": runtime.state,
            "progress": runtime.progress,
            "device": runtime.device,
            "message": runtime.message,
            "active": runtime.active,
            "is_default": runtime.metadata.id == self.default_model_id,
        }

    def _set_unavailable(self, runtime: ModelRuntime, message: str) -> None:
        runtime.state = "unavailable"
        runtime.progress = 0
        runtime.message = message
        runtime.active = False

    def _unload_engine(self, model_id: str) -> None:
        runtime = self._runtimes.get(model_id)
        if runtime is None or runtime.engine is None:
            return
        runtime.engine.unload()
        runtime.engine = None
        runtime.active = False
        if runtime.enabled:
            runtime.state = "ready"
            runtime.progress = 100
            runtime.message = "已卸载，权重已就绪"
        else:
            self._set_unavailable(runtime, "未启用")

    def _release_memory(self) -> None:
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
