@echo off
setlocal EnableExtensions

set "ROOT=%~dp0..\"
set "APP_DEVICE=%~1"
if "%APP_DEVICE%"=="" set "APP_DEVICE=cpu"

cd /d "%ROOT%backend"
set "APP_DEVICE=%APP_DEVICE%"
set "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"
set "DATABASE_URL=sqlite+aiosqlite:///./data/history.db"
set "MODEL_DIR=./models"

echo ========================================
echo   LocalMathOCR Backend
echo ========================================
echo Mode: %APP_DEVICE%
echo URL: http://127.0.0.1:8000
echo Health: http://127.0.0.1:8000/health
echo Model status: http://127.0.0.1:8000/api/model-status
echo.
echo First run may download/load pix2tex model. Please wait.
echo Stop: press Ctrl+C, then input Y and Enter, or close this window.
echo.

"%ROOT%backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000

echo.
echo Backend exited.
echo If this was not manual, check the error messages above.
pause
