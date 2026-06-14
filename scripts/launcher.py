#!/usr/bin/env python3
"""LocalMathOCR one-click launcher.

Starts backend (uvicorn) and frontend (npm dev) as detached child processes,
writes their PIDs to .runtime/*.pid so stop.bat can kill them reliably.
"""
import atexit
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

TARGET_PY = (3, 10)
ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / ".runtime"
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
VENV_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
REQUIREMENTS = BACKEND_DIR / "requirements.txt"
CHECK_CUDA = ROOT / "scripts" / "check-cuda.py"
CHECK_URL = ROOT / "scripts" / "check-url.py"

IS_WINDOWS = sys.platform == "win32"
CREATE_FLAGS = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0


# ── helpers ───────────────────────────────────────────────────────────────

def _python() -> str:
    if VENV_PYTHON.exists():
        return str(VENV_PYTHON)
    if shutil.which("python"):
        return "python"
    print("[ERROR] Python not found"); sys.exit(1)


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _write_pid(name: str, pid: int) -> None:
    p = RUNTIME / f"{name}.pid"
    p.write_text(str(pid), encoding="utf-8")


def _write_launcher_pid() -> None:
    _write_pid("launcher", os.getpid())


def _find_executable(name: str) -> str:
    path = shutil.which(name)
    if path:
        return path
    print(f"[ERROR] {name} not found in PATH"); sys.exit(1)


def _launch(cmd: list[str], cwd: str | Path, pid_name: str) -> subprocess.Popen:
    proc = subprocess.Popen(
        cmd, cwd=str(cwd), creationflags=CREATE_FLAGS,
    )
    _write_pid(pid_name, proc.pid)
    return proc


def _check_url(url: str, expected: int | None = None, timeout: float = 2) -> bool:
    py = _python()
    cmd = [py, str(CHECK_URL), url]
    if expected is not None:
        cmd.append(str(expected))
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout + 1)
        return r.returncode == 0
    except Exception:
        return False


def _cleanup() -> None:
    for name in ("backend", "frontend"):
        pid_file = RUNTIME / f"{name}.pid"
        if not pid_file.exists():
            continue
        try:
            pid = int(pid_file.read_text(encoding="utf-8").strip())
        except Exception:
            continue
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/PID", str(pid), "/F", "/T"],
                           capture_output=True, timeout=10)
        else:
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
    shutil.rmtree(RUNTIME, ignore_errors=True)


# ── startup steps ─────────────────────────────────────────────────────────

def _setup_venv_and_deps() -> None:
    if not VENV_PYTHON.exists():
        print(f"[BACKEND] Creating virtual environment: backend\\.venv")
        subprocess.run([sys.executable, "-m", "venv", str(BACKEND_DIR / ".venv")], check=True)

    py = str(VENV_PYTHON)
    print("[BACKEND] Installing/checking dependencies...")
    subprocess.run([py, "-m", "pip", "install", "--upgrade", "pip"], capture_output=True, timeout=120)
    subprocess.run([py, "-m", "pip", "install", "-r", str(REQUIREMENTS)], check=True, timeout=600)


def _check_gpu(device: str) -> None:
    if device != "cuda":
        return
    nvidia = shutil.which("nvidia-smi")
    if not nvidia:
        print("[NOTICE] nvidia-smi not found.")
        return
    subprocess.run([nvidia, "--query-gpu=name", "--format=csv,noheader"], timeout=10)
    py = _python()
    r = subprocess.run([py, str(CHECK_CUDA)], capture_output=True, timeout=30)
    if r.returncode != 0:
        print("[GPU] Installing CUDA PyTorch...")
        subprocess.run(
            [py, "-m", "pip", "install", "--upgrade", "--force-reinstall",
             "torch", "torchvision", "--index-url",
             "https://download.pytorch.org/whl/cu128"],
            check=True, timeout=1200,
        )
    print("[GPU] Ensuring onnxruntime-gpu is installed for P2T GPU acceleration...")
    subprocess.run(
        [py, "-m", "pip", "install", "--upgrade", "onnxruntime-gpu"],
        capture_output=True, timeout=300,
    )


def _install_frontend_deps() -> None:
    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        print("[FRONTEND] Installing dependencies...")
        subprocess.run(["npm", "install"], cwd=str(FRONTEND_DIR), check=True, timeout=300)


# ── main ──────────────────────────────────────────────────────────────────

def main() -> int:
    device = sys.argv[1] if len(sys.argv) > 1 else "cpu"
    mode = "GPU" if device == "cuda" else "CPU"

    print()
    print(f"  Mode: {mode}")
    print()

    RUNTIME.mkdir(exist_ok=True)
    _write_launcher_pid()

    # Pre-flight checks
    for port, name in ((8000, "Backend"), (5173, "Frontend")):
        if _port_in_use(port):
            print(f"[ERROR] Port {port} already in use. Run stop.bat first.")
            return 1

    try:
        # Setup
        _setup_venv_and_deps()
        _check_gpu(device)
        npm = _find_executable("npm")
        _install_frontend_deps()

        # Launch backend
        py = _python()
        print()
        print("[START] Backend: http://127.0.0.1:8000")
        backend = _launch(
            [py, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
            BACKEND_DIR, "backend",
        )
        print(f"        PID: {backend.pid}")

        # Launch frontend
        print("[START] Frontend: http://127.0.0.1:5173")
        frontend = _launch(
            [npm, "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
            FRONTEND_DIR, "frontend",
        )
        print(f"        PID: {frontend.pid}")

        # Wait for backend
        print()
        print("[WAIT] Backend health check (max 60s)...")
        for i in range(30):
            if _check_url("http://127.0.0.1:8000/health", 200):
                print("[OK] Backend is running.")
                break
            time.sleep(2)
        else:
            print("[ERROR] Backend did not become ready in 60s. Check Backend window.")
            return 1

        # Wait for frontend
        print("[WAIT] Frontend check (max 40s)...")
        for i in range(20):
            if _check_url("http://127.0.0.1:5173"):
                print("[OK] Frontend is running.")
                break
            time.sleep(2)
        else:
            print("[ERROR] Frontend did not become ready in 40s. Check Frontend window.")
            return 1

        # Open browser
        import webbrowser
        webbrowser.open("http://127.0.0.1:5173")

        # Done
        print()
        print("=" * 48)
        print("  LocalMathOCR started successfully!")
        print("=" * 48)
        print(f"  Health:  http://127.0.0.1:8000/health")
        print(f"  Status:  http://127.0.0.1:8000/api/model-status")
        print(f"  App:     http://127.0.0.1:5173")
        print()
        print(f"  Backend PID: {backend.pid}")
        print(f"  Frontend PID: {frontend.pid}")
        print()
        print("  To stop: double-click stop.bat, or press Ctrl+C here.")
        print()

        # Keep alive until Ctrl+C
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print()
            print("[STOP] Shutting down...")
            return 0

    except KeyboardInterrupt:
        print("\n[STOP] Interrupted.")
        return 130
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Command failed (exit {e.returncode}).")
        return 1
    except Exception as e:
        print(f"[ERROR] {e}")
        return 1


if __name__ == "__main__":
    atexit.register(_cleanup)
    raise SystemExit(main())
