# LocalMathOCR v2.0.0

LocalMathOCR v2.0.0 是一次正式的大版本更新，核心目标是把项目从单一 Pix2Tex 推理后端升级为可扩展的多模型数学公式 OCR 工作台，并修复模型切换、状态同步和导出字体相关问题。

## 重点更新

### 多模型 OCR 架构

本版本新增模型生命周期管理器，支持：

- Pix2Tex：基础版，轻量、快速、CPU 友好。
- LaTeX_OCR：高精度版，需要配置独立权重或 Hugging Face 仓库。
- Uni-Equation：专业版，面向复杂公式、大型矩阵、多层嵌套结构，建议大显存环境使用。

新增接口：

```http
GET /api/models
GET /api/models/events
POST /api/models/{model_id}/activate
POST /api/ocr
```

### 模型生命周期管理

新增 `ModelManager`，统一管理：

- 模型注册与元数据
- 权重检查与自动下载
- 启动预加载配置 `PRELOAD_MODELS`
- 模型热切换
- 旧模型卸载与显存释放
- SSE 状态推送
- 推理期间并发锁保护

默认仅预热 Pix2Tex，降低启动显存压力。切换大模型时会卸载旧模型，并触发 `gc.collect()` 与 `torch.cuda.empty_cache()`。

### 前端模型选择与状态同步

新增模型选择卡片 UI：

- `ready`：可点击切换。
- `downloading`：显示下载/加载进度。
- `unavailable`：置灰并提示未启用或未配置。

前端通过 SSE 实时接收后端状态，避免“前端显示已切换，但后端仍使用旧模型”的问题。

### 导出字体优化

- 默认导出字体调整为 Times New Roman。
- 支持 Cambria Math、STIX Two Math、Latin Modern Math、Georgia、Arial 等字体。
- 修复 KaTeX 内部字体覆盖导致默认字体不生效的问题。
- PNG / SVG 导出时与预览字体保持一致。

### 文档与展示更新

- 更新 README 项目预览区。
- 优化主界面展示图。
- 优化导出与字体选择展示图。
- 优化模型选择与状态同步 SVG。
- 优化模型生命周期管理 SVG，修复底部文字重叠。
- 新增完整 CHANGELOG.md。

## 重要修复

- 修复切换模型后实际推理仍使用旧模型的问题。
- 修复 LaTeX_OCR 未配置独立权重时误复用 Pix2Tex 权重的问题。
- 修复模型下载、加载、切换期间前后端状态不同步的问题。
- 修复 Times New Roman 默认字体未真正应用到 KaTeX 渲染结果的问题。
- 修复文档 SVG 图片底部文字重叠和排版拥挤问题。

## 新增配置

```env
PRELOAD_MODELS=pix2tex
ENABLE_PIX2TEX=true
ENABLE_LATEX_OCR=true
ENABLE_UNI_EQUATION=false
LATEX_OCR_CHECKPOINT=
LATEX_OCR_REPO_ID=
UNI_EQUATION_REPO_ID=
UNI_EQUATION_MODEL_NAME=
UNI_EQUATION_CHECKPOINT=
MAX_LOADED_MODELS=1
MODEL_DOWNLOAD_TIMEOUT_SEC=1800
```

## 验证方式

查看模型状态：

```bash
curl http://127.0.0.1:8000/api/models
```

切换模型：

```bash
curl -X POST http://127.0.0.1:8000/api/models/latex_ocr/activate
```

OCR 返回结果中会包含实际使用的模型：

```json
{
  "model_id": "latex_ocr"
}
```

## 升级建议

- 普通 CPU / 低显存设备建议保持 `PRELOAD_MODELS=pix2tex`。
- 使用 LaTeX_OCR 前请配置独立权重或仓库。
- 使用 Uni-Equation 前建议确认显存大于 8GB，并配置模型仓库或本地模型目录。
