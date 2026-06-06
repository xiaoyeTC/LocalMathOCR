@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "RUNTIME=%ROOT%.runtime"

echo.
echo ========================================
echo   LocalMathOCR Stopper
echo ========================================
echo.

if not exist "%RUNTIME%" mkdir "%RUNTIME%" >nul 2>nul
echo stopping > "%RUNTIME%\stopping.flag"

:: Kill by PID files (most reliable)
for %%n in (backend frontend launcher) do (
  if exist "%RUNTIME%\%%n.pid" (
    set /p TARGET_PID=<"%RUNTIME%\%%n.pid"
    if defined TARGET_PID (
      echo [STOP] %%n PID: !TARGET_PID!
      taskkill /PID !TARGET_PID! /F /T >nul 2>nul
    )
    set "TARGET_PID="
  )
)

:: Also kill by port (cleanup any leftover)
for %%p in (5173 8000) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
    echo [STOP] Port %%p PID: %%a
    taskkill /PID %%a /F /T >nul 2>nul
  )
)

:: Cleanup PID files, keep stopping.flag briefly so start.bat can exit without pause
if exist "%RUNTIME%\backend.pid" del /q "%RUNTIME%\backend.pid" >nul 2>nul
if exist "%RUNTIME%\frontend.pid" del /q "%RUNTIME%\frontend.pid" >nul 2>nul
if exist "%RUNTIME%\launcher.pid" del /q "%RUNTIME%\launcher.pid" >nul 2>nul

echo.
echo [OK] All project processes stopped.
ping -n 2 127.0.0.1 >nul
exit /b 0
