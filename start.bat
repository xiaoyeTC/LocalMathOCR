@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ========================================
echo   LocalMathOCR Launcher
echo ========================================
echo.
echo Select run mode:
echo   [1] CPU mode - best compatibility, slower
echo   [2] GPU mode - requires NVIDIA GPU/CUDA, faster
echo.
choice /C 12 /N /M "Input 1 or 2: "
if errorlevel 2 (
  set "APP_DEVICE=cuda"
) else (
  set "APP_DEVICE=cpu"
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] python not found. Please install Python 3.10 or 3.11.
  pause
  exit /b 1
)

python "%ROOT%scripts\launcher.py" "%APP_DEVICE%"
set "LAUNCH_EXIT=%errorlevel%"

if exist "%ROOT%.runtime\stopping.flag" (
  del /q "%ROOT%.runtime\stopping.flag" >nul 2>nul
  rmdir /q "%ROOT%.runtime" >nul 2>nul
  exit /b 0
)

if not "%LAUNCH_EXIT%"=="0" (
  echo.
  echo [ERROR] Launcher exited with code %LAUNCH_EXIT%.
  pause
  exit /b %LAUNCH_EXIT%
)

exit /b 0
