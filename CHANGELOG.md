# 更新日志

## [2.4.0]

### 新增

#### 设置面板
- 新增右侧滑入式设置面板，点击 Header ⚙️ 按钮打开。
- 用户设置：默认模型（下拉选择）、轻度预处理开关。
- 管理员设置：模型启用/禁用、预加载模型、最大加载数、下载超时、P2T 模型版本、HF 镜像地址。
- 运行模式只读展示（auto/cpu/cuda）。
- 设置保存到 `backend/.env`，部分设置需重启后端生效。
- 管理员密码通过 `ADMIN_PASSWORD` 环境变量配置，未设置时管理员设置不显示。

#### Header GitHub 链接
- Header 新增 GitHub 图标按钮，点击跳转项目仓库。

### 修复

#### SQLite 迁移
- `init_db()` 启动时自动检查 `session_id` 列是否存在，不存在则 `ALTER TABLE` 添加，解决旧数据库升级问题。

#### 设置保存
- 修复 `PUT /api/settings` 的 `isinstance(bool(val))` 语法错误（应为 `isinstance(val, bool)`）。

#### 管理员权限
- 未设置 `ADMIN_PASSWORD` 时，`_verify_admin()` 返回 `false`，管理员设置不再默认显示。

### 优化

#### 布局重构
- SettingsPanel 从 Header 内部移至 App 顶层渲染，解决 `sticky` 与 `fixed` 定位冲突。
- 预处理开关从 UploadZone 移至设置面板。
- Header 主题按钮（🎨）与设置按钮（⚙️）分离。
- README 预览截图改为独立小节，新增设置面板截图。

## [2.3.2]

### 修复

#### P2T 引擎优化
- P2T 引擎改用 `LatexOCR.recognize()` 直接调用，移除 `TextFormulaOCR` 包装，消除 `text_ocr must not be None` 警告。
- GPU 模式下自动检测 `CUDAExecutionProvider` 是否可用，不可用时回退 CPU 并提示。

#### Uni-Equation 权重检查
- `weights_exist()` 改为检查具体模型文件（`pytorch_model.bin`、`model.safetensors` 等），不再仅检查目录是否存在。
- `download_sync()` 发现目录存在但权重不完整时，先删除残留目录再重新下载。
- 默认仓库更新为 `wanderkid/unimernet`。

#### 前端模型状态与错误处理
- `applyModelPayload` 移除 `selectedModelId` 依赖，SSE 连接不再因模型切换而重建。
- `handleSelectModel` 移除 `setLoading`，切换模型不再影响上传按钮状态。
- `handleCroppedFile` 识别前检查模型是否就绪，未就绪时自动降级到基础版。
- 404 错误回退重试，503 错误提示等待，不再误触发回退。

#### 下拉菜单进度显示
- 下拉菜单选项和触发按钮新增下载进度条。
- 选中模型正在下载/加载时，在下拉按钮下方显示进度卡片。

#### 配置修复
- `HF_ENDPOINT` 新增为合法配置项，从 `.env` 读取后自动设置到环境变量。

## [2.3.1]

### 优化

#### 移动端适配
- 全面响应式布局适配，手机端可正常使用全部核心功能。
- Header：Logo 缩小，副标题小屏隐藏，状态栏始终可见（精简显示状态点和文字）。
- 模型选择器：卡片式单列 → 双列 → 三列自适应。
- LaTeX 编辑器：高度从 360px 降至 240px，最小高度自适应。
- 实时预览：工具栏自动换行防溢出，最小高度自适应。
- 图片裁剪：按钮自适应宽度，标题和操作栏小屏垂直堆叠。
- 符号面板：内边距和间距缩小适配小屏。
- 主间距和标题字号全面使用 `sm:` 断点渐进增强。

### 文档
- README 新增移动端预览截图。
- 技术栈表格化，所有依赖项目添加 GitHub 仓库链接。
- README 目录结构新增 `preview-mobile.png`。

## [2.3.0]

### 新增

#### 主题系统
- 新增主题状态管理 `themeStore`，支持模型选择器样式和配色方案切换。
- 新增下拉菜单式模型选择器 `ModelSelectorDropdown`，可与经典卡片式自由切换。
- 新增 8 种预设主题配色（蓝色、靛蓝、紫色、玫瑰、琥珀、翡翠、青色、石墨）。
- Header 新增 ⚙️ 设置按钮，支持一键切换模型选择器样式和配色方案。
- 主题设置持久化到 `localStorage`，刷新页面不丢失。
- CSS 变量化主配色（`--color-primary`），Tailwind 通过 `var()` 引用，支持动态切换。

### 优化

#### 模型显存需求修正
- Pix2Text：`<2GB` → `<1GB`（ONNX 推理无需 PyTorch，显存占用极低）。
- LaTeX_OCR：`4GB - 6GB` → `2GB+`（pix2tex LatexOCR 模型约 200MB，PyTorch 推理约 2GB）。
- Uni-Equation：`>8GB` → `6GB+`（Uni-MER 模型约 2-4GB，推理峰值约 6GB）。

#### 字体选择修正
- "KaTeX 默认" 重命名为 "KaTeX 内置"，避免与默认字体 Times New Roman 混淆。

## [2.2.0]

### 优化

#### 模型启动条件简化
- LaTeX_OCR 现在只需 `ENABLE_LATEX_OCR=true` 即可启用，使用 pix2tex 包内置权重，无需额外配置 `LATEX_OCR_CHECKPOINT` 或 `LATEX_OCR_REPO_ID`。
- Uni-Equation 设置默认模型 `anonymous945/Uni-MER`，只需 `ENABLE_UNI_EQUATION=true` 即可启用，首次启动自动下载。
- 移除模型注册时的配置检查限制，`enable_*` 标志即为唯一启用条件。

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

## [2.1.0]

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

## [2.0.0]

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

## [1.1.0]

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
