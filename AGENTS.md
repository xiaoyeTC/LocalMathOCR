# AGENTS.md

## Overview

LocalMathOCR — local math formula OCR web app. Two independent packages, no monorepo tooling.

- `backend/` — Python 3.10+ FastAPI + Pix2Text (P2T) + PyTorch
- `frontend/` — React 18 + TypeScript + Vite + Tailwind + Zustand

## Commands

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on :5173, proxies /api → :8000
npm run build      # tsc (typecheck) + vite build
npm run preview    # preview production build
```

### One-click (Windows)

`start.bat` — creates venv, installs deps, launches both servers.
`stop.bat` — kills processes on ports 5173 and 8000.

### Docker

```bash
docker compose --profile cpu up --build
docker compose --profile gpu up --build
```

## Architecture

- Backend entry: `backend/app/main.py` — FastAPI app with `lifespan` that initializes DB and preloads models via `ModelManager`.
- Model system: `ModelManager` (`backend/app/services/model_manager.py`) handles registration, weight download, lazy load, hot-switch, and unload of multiple OCR engines (Pix2Text, LaTeX_OCR, Uni-Equation). SSE endpoint `/api/models/events` pushes state changes.
- Config: `backend/app/config.py` — pydantic-settings, reads from `backend/.env`. All env vars documented in README.
- Frontend state: single Zustand store in `frontend/src/stores/appStore.ts`.
- Frontend API layer: `frontend/src/services/api.ts`.
- Vite proxy: `/api` → `http://127.0.0.1:8000` (configured in `vite.config.ts`).

## API response format

All endpoints return `{ "code": 200, "message": "success", "data": {...} }`. Use the `success()` helper in `backend/app/routers/common.py`.

## Key conventions

- Python: no type: ignore, no `# type: skip`. Settings via `get_settings()` (lru_cached singleton).
- Frontend: strict TypeScript (`strict: true` in tsconfig). Dark mode via Tailwind `class` strategy.
- No test framework is configured. No lint scripts defined. `npm run build` is the closest to CI verification (runs `tsc` then `vite build`).
- Model weights, SQLite DB, and `node_modules/` are all gitignored. First run downloads models automatically.
- Backend ports: 8000. Frontend dev: 5173. Docker frontend: 8080.
