# 更新日志

## [2.2.0] - 2026-06-13

### 优化

#### 模型下载与进度管理
- 重构三个引擎（Pix2Text、LaTeX_OCR、Uni-Equation）的下载逻辑，统一为「检查已下载 → 下载 → 加载」三阶段流程。
- 已下载的模型自动跳过下载步骤，直接进入加载阶段。
- 下载阶段通过 SSE 实时推送进度到前端，前端模型卡片可显示下载百分比。
- Pix2Text 引擎的下载与加载完全分离，下载阶段使用 `snapshot_download` + 进度回调，加载阶段仅从本地读取。

#### HuggingFace 镜像回退策略
- 新增 `_hf_download_with_mirror()` 共用函数，统一三个引擎的 HuggingFace 下载行为。
- 下载时先尝试 HuggingFace 官方渠道，连接失败后自动回退 `hf-mirror.com` 国内镜像。
- 用户可通过 `HF_ENDPOINT` 环境变量自定义 HuggingFace 端点。
- `LatexOCREngine` 和 `UniEquationEngine` 的 `download_sync` 同步接入镜像回退策略。

### 配置
- `HF_ENDPOINT`：新增环境变量，可指定 HuggingFace 镜像地址（如 `https://hf-mirror.com`）。

## [2.1.0] - 2026-06-13

### 新增

#### 手动框选裁剪
- 新增图片裁剪组件 `ImageCropper`，基于 `react-image-crop` 实现。
- 用户上传图片后默认进入裁剪模式，默认选区覆盖整张图片，可拖拽缩小至纯公式区域。
- 裁剪区域覆盖半透明遮罩，选区内显示"请框选纯公式区域"提示文字。
- 提供"确认框选"与"取消"按钮，确认后通过 Canvas API 将选区裁剪为新图片再发送 OCR。
- 粘贴图片同样自动进入裁剪流程。

#### 识别置信度提示
- OCR 接口返回新增 `confidence` 字段（0~1），前端读取后在编辑器上方显示置信度警告。
- 当 `confidence < 0.8` 时，显示醒目黄色警告条："识别置信度较低，可能存在错误，请人工核对"。
- 当 `confidence >= 0.8` 时不显示提示。
- 向后兼容：旧版后端未返回 `confidence` 字段时，默认视为高置信度处理，不报错。

#### 替换基础模型为 Pix2Text (P2T)
- 基础版 OCR 引擎由 `pix2tex` 替换为 `Pix2Text (P2T)`，使用 ONNX 后端，CPU 友好。
- P2T 使用 MFR 1.5 模型，公式识别精度提升。
- `LatexOCREngine` 改为直接继承 `BaseOCREngine`，仍使用 pix2tex 包的 `LatexOCR` 类。
- 新增 `P2T_MFR_MODEL` 环境变量，可配置 P2T 公式识别模型版本（默认 `mfr-1.5`）。
- 前端模型选择器显示名称由"基础版 (Pix2Tex)"更新为"基础版 (Pix2Text)"。

### 依赖
- 新增 `react-image-crop` 前端裁剪库。
- 新增 `pix2text>=1.1.4`，替代 `pix2tex` 作为基础版 OCR 引擎。

## [2.0.0] - 2026-06-07

LocalMathOCR 2.0.0 是一次正式的大版本更新，重点完成多模型 OCR 架构、模型生命周期管理、前后端状态同步、导出字体体验与项目文档展示升级。

### 新增

#### 多模型 OCR 架构
- 新增 `ModelManager` 模型生命周期管理器，统一管理模型注册、权重检查、自动下载、懒加载、热切换与卸载。
- 新增 Pix2Tex、LaTeX_OCR、Uni-Equation 三种模型配置入口。
- 新增模型元数据定义，包含显示名称、特点说明、显存需求与擅长场景。
- 新增 `GET /api/models`，用于返回模型列表、状态、进度和当前激活模型。
- 新增 `GET /api/models/events`，通过 SSE 实时推送模型状态。
- 新增 `POST /api/models/{model_id}/activate`，支持前端主动切换当前模型。
- 新增 `POST /api/ocr`，支持通过 `model_id` 指定单次推理模型。

#### 模型下载与配置
- 支持 `PRELOAD_MODELS` 配置启动时需要初始化的模型列表。
- 支持缺失权重时自动下载模型文件。
- 支持通过 Hugging Face 仓库或本地 checkpoint 配置 LaTeX_OCR。
- 支持通过 Hugging Face 仓库、模型名或本地目录配置 Uni-Equation。
- 未配置独立权重的 LaTeX_OCR 不再复用 Pix2Tex 权重，避免误判模型已切换。

#### 前端模型选择
- 新增模型选择卡片 UI，展示 Pix2Tex、LaTeX_OCR、Uni-Equation 的状态、描述、显存需求和适用场景。
- `ready` 状态可点击切换，`downloading` 状态显示下载/加载进度，`unavailable` 状态置灰并提示配置缺失。
- 前端点击模型时会调用后端激活接口，确保 UI 选择与实际推理模型一致。

#### 导出与字体
- 新增公式导出字体选择能力。
- 默认字体改为 `Times New Roman`。
- 支持 Cambria Math、STIX Two Math、Latin Modern Math、Georgia、Arial 等字体选项。
- PNG / SVG 导出时同步覆盖 KaTeX 内部字体，保证预览和导出一致。

#### 文档与展示
- 更新 README 项目预览区。
- 新增/优化主界面 SVG 截图。
- 新增/优化导出与字体选择 SVG 截图。
- 优化模型选择与状态同步 SVG 排版。
- 优化模型生命周期管理 SVG 排版，修复底部文字重叠问题。
- 新增正式版 GitHub Release 文案文件。

### 修复
- 修复前端切换模型后，后端实际推理仍使用旧模型的问题。
- 修复模型加载/卸载过程中缺少并发锁导致的状态漂移风险。
- 修复 LaTeX_OCR 未配置独立权重时误显示为可用的问题。
- 修复公式预览与导出默认字体看似设置为 Times New Roman、实际仍被 KaTeX 字体覆盖的问题。
- 修复文档 SVG 图底部文字重叠、排版拥挤的问题。

### 优化
- 默认仅预热轻量 Pix2Tex，降低启动显存压力。
- 切换模型后自动卸载旧模型并触发显存清理。
- 模型状态通过 SSE 推送，减少前端轮询和状态不同步问题。
- README 补充 LaTeX_OCR 与 Uni-Equation 的真实启用方式和验证方法。

### 配置

新增或完善以下环境变量：
- `PRELOAD_MODELS`
- `ENABLE_PIX2TEX`
- `ENABLE_LATEX_OCR`
- `ENABLE_UNI_EQUATION`
- `LATEX_OCR_CHECKPOINT`
- `LATEX_OCR_REPO_ID`
- `UNI_EQUATION_REPO_ID`
- `UNI_EQUATION_MODEL_NAME`
- `UNI_EQUATION_CHECKPOINT`
- `MAX_LOADED_MODELS`
- `MODEL_DOWNLOAD_TIMEOUT_SEC`

### 依赖
- 新增 `transformers>=4.45.0`
- 新增 `accelerate>=0.34.0`
- 新增 `huggingface_hub>=0.26.0`

## [1.1.0] - 2026-06-07

### 新增

- 新增公式图片增强预处理管道 `enhance_formula_image`。
- 支持灰度化、自适应二值化、非局部均值去噪、卷积锐化和 2 倍高清放大。
- OCR 推理前新增 `enhanced` 图像识别分支，用于提升浅色背景、PPT 截图、模糊 PDF 截图等低质量图片的识别稳定性。

### 优化

- `/api/recognize` 路由在原始识别结果可疑时，会同时尝试原有预处理图和增强预处理图，并选择评分最高的 LaTeX 结果。
- 增强预处理失败时自动回退原图，避免服务因图片处理异常崩溃。
- 前端默认字体调整为 `Times New Roman`。

### 依赖

- 项目已包含 `opencv-python-headless`、`numpy`、`Pillow`，本版本无需新增额外依赖。

### 版本

- 版本号由 `1.0.0` 升级至 `1.1.0`。

## [1.0.0]

- 初始版本。
