# LocalMathOCR

<div align="center">

**完全本地运行的数学公式 OCR Web 应用**

前端使用 **React + TypeScript + Vite**，后端使用 **FastAPI + pix2tex**，在本机 CPU / GPU 上完成公式图片到 LaTeX 的识别、编辑、预览与导出。

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 项目预览

> 下列截图建议放在 `docs/` 目录下，推送到 GitHub 后会自动显示。

### 主界面

![LocalMathOCR 主界面](docs/preview-main.png)

### 导出与字体选择

![LocalMathOCR 导出与字体选择](docs/preview-export.png)

---

## 核心特性

- **全本地识别**：不依赖外部付费 OCR API，公式识别在本机完成
- **CPU / GPU 自动适配**：支持自动检测 CUDA，也可手动切换运行模式
- **图片预处理**：灰度化、二值化、去白边、放大、倾斜校正，提升识别稳定性
- **拖拽 / 上传 / 剪贴板粘贴**：支持 JPG、PNG、WebP 直接识别
- **LaTeX 编辑与实时预览**：CodeMirror 编辑源码，KaTeX 实时渲染结果
- **导出能力**：支持 PNG / SVG 导出，并可选择导出字体
- **历史记录**：本地 SQLite 持久化，支持回显、删除和清空
- **双端开发体验**：后端 FastAPI + 前端 Vite，结构清晰，便于二次开发

---

## 页面功能说明

| 模块 | 说明 |
| --- | --- |
| 上传识别 | 拖拽、上传、粘贴图片，一键识别公式 |
| 预处理开关 | 对输入图像做轻度预处理，适合截图和拍照图 |
| LaTeX 编辑器 | 可直接修改识别结果，适合快速修正公式 |
| 实时预览 | 右侧预览区域即时展示最终渲染效果 |
| 导出 | 可导出 PNG / SVG，并选择导出字体 |
| 历史记录 | 查看历史识别记录，支持删除与清空 |
| 模型状态 | 实时显示本地模型加载状态、设备与错误信息 |

---

## 技术栈

### 前端

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- CodeMirror
- KaTeX
- html2canvas

### 后端

- FastAPI
- Uvicorn
- pix2tex
- PyTorch
- OpenCV
- Pillow
- SQLite + aiosqlite

---

## 快速开始

### 1. 环境要求

#### CPU 模式

- Python 3.10+
- 建议 4 核 CPU、8GB 内存以上
- 首次模型加载可能需要数十秒

#### GPU 模式

- NVIDIA GPU，建议 6GB 显存以上
- 已安装 NVIDIA Driver
- 可访问 CUDA / NVIDIA Container Toolkit

---

### 2. Windows 一键启动

双击根目录脚本：

```text
start.bat
```

启动后可选择：

```text
[1] CPU 模式：兼容性最好，速度较慢
[2] GPU 模式：需要 NVIDIA GPU / CUDA 环境，速度更快
```

脚本会自动完成：

- 检查 Python、npm、端口占用
- 创建后端虚拟环境 `backend/.venv`
- 安装/检查后端依赖
- 安装/检查前端依赖
- 启动后端与前端窗口
- 自动打开浏览器访问前端页面

> 首次运行 pix2tex 时可能需要下载或加载模型，请等待页面右上角状态变为 **ready**。

### 3. 停止服务

双击根目录脚本：

```text
stop.bat
```

它会停止前端、后端以及启动器残留进程，并清理端口占用。

---

## Docker 启动

### CPU

```bash
docker compose --profile cpu up --build
```

### GPU

```bash
docker compose --profile gpu up --build
```

访问地址：

- 前端：`http://localhost:8080`
- 后端健康检查：`http://localhost:8000/health`
- 模型状态：`http://localhost:8000/api/model-status`

---

## 本地开发

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

开发环境下默认通过 Vite 代理访问后端，避免跨域问题。

---

## 环境变量

### 后端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DEVICE` | `auto` | `auto` / `cpu` / `cuda` |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/history.db` | SQLite 数据库地址 |
| `MODEL_DIR` | `./models` | 模型缓存目录 |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080` | 允许跨域来源 |

### 前端

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | 后端 API 地址 |

---

## API 概览

统一响应格式：

```json
{ "code": 200, "message": "success", "data": {} }
```

### 主要接口

- `GET /api/model-status`
- `POST /api/recognize`  
  表单字段：`file`、`preprocess`
- `GET /api/history`
- `POST /api/history`
- `DELETE /api/history`
- `DELETE /api/history/{id}`

---

## 目录结构

```text
LocalMathOCR/
├─ backend/
│  ├─ app/
│  ├─ models/
│  ├─ data/
│  └─ requirements.txt
├─ frontend/
│  ├─ src/
│  ├─ index.html
│  └─ package.json
├─ docs/
│  ├─ preview-main.png
│  └─ preview-export.png
├─ start.bat
├─ stop.bat
└─ README.md
```

---

## 注意事项

- 本项目不调用外部识别 API；首次运行可能下载开源模型权重。
- 建议在可信网络环境下提前缓存模型到 `MODEL_DIR`。
- 识别准确率与图片清晰度关系较大，建议使用白底黑字、边缘完整、分辨率足够的截图。
- 若后端未就绪，前端会提示无法连接，请先确认 `http://127.0.0.1:8000/health` 是否可访问。

---

## 许可

本项目采用 MIT License。
