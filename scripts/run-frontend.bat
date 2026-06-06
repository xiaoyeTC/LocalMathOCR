@echo off
setlocal EnableExtensions

set "ROOT=%~dp0..\"
cd /d "%ROOT%frontend"

set "VITE_API_BASE_URL=http://127.0.0.1:8000/api"

echo ========================================
echo   LocalMathOCR Frontend
echo ========================================
echo URL: http://127.0.0.1:5173
echo API: http://127.0.0.1:8000/api
echo.
echo Stop: press Ctrl+C, then input Y and Enter, or close this window.
echo.

call npm run dev -- --host 0.0.0.0 --port 5173

echo.
echo Frontend exited.
echo If this was not manual, check the error messages above.
pause
