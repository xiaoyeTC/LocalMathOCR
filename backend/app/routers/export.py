import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.config import get_settings
from app.routers.common import success

router = APIRouter(prefix="/api/export", tags=["export"])

_DANGEROUS_LATEX_PATTERNS = re.compile(
    r"\\(write18|immediate|input\s*\{|include\s*\{|read\s|openin|closein|"
    r"catcode|shellescape|system\s*\{|exec\s*\{|pipe\s*\{|"
    r"def\s|newcommand|renewcommand|makeatletter|makeatother)",
    re.IGNORECASE,
)


def _sanitize_latex_for_compile(latex: str) -> str:
    """Block LaTeX commands that could execute shell commands."""
    if _DANGEROUS_LATEX_PATTERNS.search(latex):
        raise ValueError("LaTeX contains potentially dangerous commands")
    return latex


def _convert_text_format(format: str, latex: str) -> str:
    text = latex.strip()
    if format == "latex-inline":
        return f"${text}$"
    if format == "latex-display":
        return f"$${text}$$"
    if format == "latex-equation":
        return f"\\begin{{equation}}\n{text}\n\\end{{equation}}"
    if format == "markdown-inline":
        return f"${text}$"
    if format == "markdown-block":
        return f"$$\n{text}\n$$"
    if format == "text":
        return text
    raise ValueError(f"Unknown text format: {format}")


def _convert_with_pandoc(latex: str, target_format: str) -> tuple[bytes, str, str]:
    import subprocess
    import tempfile
    from pathlib import Path

    settings = get_settings()
    pandoc = settings.pandoc_path

    latex = _sanitize_latex_for_compile(latex)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "formula.tex"
        tex_content = (
            "\\documentclass{article}\n"
            "\\usepackage{amsmath,amssymb}\n"
            "\\begin{document}\n"
            f"{latex}\n"
            "\\end{document}\n"
        )
        tex_path.write_text(tex_content, encoding="utf-8")

        ext_map = {"docx": "docx", "pdf": "pdf", "html": "html"}
        ext = ext_map[target_format]
        out_path = Path(tmpdir) / f"formula.{ext}"

        cmd = [pandoc, str(tex_path), "-o", str(out_path)]
        if target_format == "pdf":
            cmd.extend(["--pdf-engine", settings.xelatex_path])

        result = subprocess.run(cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            import logging
            logging.getLogger(__name__).warning("Pandoc failed: %s", result.stderr.decode("utf-8", errors="replace"))
            raise RuntimeError("文件转换失败")

        content = out_path.read_bytes()

    mime_map = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "html": "text/html; charset=utf-8",
    }
    return content, mime_map[target_format], ext


def _convert_to_mathml(latex: str) -> str:
    import subprocess

    latex = _sanitize_latex_for_compile(latex)
    settings = get_settings()
    result = subprocess.run(
        [settings.pandoc_path, "-f", "latex", "-t", "mathml", "--wrap=none"],
        input=latex.encode("utf-8"),
        capture_output=True,
        timeout=10,
    )
    if result.returncode == 0:
        return result.stdout.decode("utf-8")
    raise RuntimeError("MathML conversion requires pandoc")


@router.post("/{format}")
async def export_formula(format: str, body: dict):
    settings = get_settings()
    latex = body.get("latex", "").strip()
    if not latex:
        raise HTTPException(status_code=400, detail="latex field is required")

    text_formats = {
        "latex-inline", "latex-display", "latex-equation",
        "markdown-inline", "markdown-block", "text",
    }

    if format in text_formats:
        content = _convert_text_format(format, latex)
        return success({"content": content, "mime": "text/plain"})

    if format == "mathml":
        try:
            content = _convert_to_mathml(latex)
            return success({"content": content, "mime": "application/xml"})
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    pandoc_formats = {"docx", "pdf", "html"}
    if format in pandoc_formats:
        if not settings.enable_pandoc:
            raise HTTPException(status_code=501, detail="Pandoc export is not enabled. Set ENABLE_PANDOC=true in .env")
        try:
            content, mime, ext = _convert_with_pandoc(latex, format)
            return Response(
                content=content,
                media_type=mime,
                headers={"Content-Disposition": f'attachment; filename="formula.{ext}"'},
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail=f"Pandoc not found: {exc}. Install pandoc and set PANDOC_PATH.") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    raise HTTPException(status_code=400, detail=f"Unknown export format: {format}")
