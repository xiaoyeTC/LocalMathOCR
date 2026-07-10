import asyncio
import re

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.routers.common import success

router = APIRouter(prefix="/api/compute", tags=["compute"])

MAX_LATEX_LENGTH = 2000
COMPUTE_TIMEOUT_SEC = 10


def _latex_to_sympy_str(latex: str) -> str:
    text = latex.strip()
    for wrapper in ["\\begin{equation}", "\\end{equation}", "\\begin{align}", "\\end{align}"]:
        text = text.replace(wrapper, "")
    text = text.strip().strip("$").strip()

    text = text.replace("\\left", "").replace("\\right", "")
    text = text.replace("\\,", " ").replace("\\!", "").replace("\\;", " ").replace("\\quad", " ").replace("\\qquad", " ")

    text = text.replace("\\cdot", "*").replace("\\times", "*").replace("\\div", "/")
    text = text.replace("\\pm", "+").replace("\\mp", "-")
    text = text.replace("\\leq", "<=").replace("\\geq", ">=").replace("\\neq", "!=")
    text = text.replace("\\approx", "~").replace("\\equiv", "==")
    text = text.replace("\\infty", "oo").replace("\\pi", "pi")

    text = re.sub(r"\\frac\{([^}]*)\}\{([^}]*)\}", r"((\1)/(\2))", text)
    text = re.sub(r"\\sqrt\{([^}]*)\}", r"sqrt(\1)", text)
    text = re.sub(r"\\sqrt\[([^\]]*)\]\{([^}]*)\}", r"(\2)**(1/(\1))", text)

    text = re.sub(r"\\sin\{([^}]*)\}", r"sin(\1)", text)
    text = re.sub(r"\\cos\{([^}]*)\}", r"cos(\1)", text)
    text = re.sub(r"\\tan\{([^}]*)\}", r"tan(\1)", text)
    text = re.sub(r"\\ln\{([^}]*)\}", r"log(\1)", text)
    text = re.sub(r"\\log\{([^}]*)\}", r"log(\1)", text)
    text = re.sub(r"\\exp\{([^}]*)\}", r"exp(\1)", text)

    text = re.sub(r"\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\^\{?(\d+)\}?\s*\(?([^()\s]+)\)?", r"\1(\3)**\2", text)
    text = re.sub(r"\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\^\{?(\d+)\}?", r"**\2", text)
    text = re.sub(r"\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh)\b", r"\1", text)
    text = re.sub(r"\\(ln|log|exp)\b", lambda m: {"ln": "log", "log": "log", "exp": "exp"}[m.group(1)], text)
    text = re.sub(r"\\(abs)\b", r"\1", text)

    text = text.replace("{", "(").replace("}", ")")
    text = re.sub(r"\^\(([^)]*)\)", r"**(\1)", text)
    text = re.sub(r"\^(\w)", r"**\1", text)

    text = re.sub(r"([a-zA-Z]+)_\(([^)]*)\)", r"\1_\2", text)
    text = re.sub(r"([a-zA-Z]+)_(\w)", r"\1_\2", text)
    text = re.sub(r"_(\w)", r"_\1", text)

    text = re.sub(r"\\mathrm\(([^)]*)\)", r"\1", text)
    text = re.sub(r"\\mathbb\(([^)]*)\)", r"\1", text)
    text = re.sub(r"\\mathbf\(([^)]*)\)", r"\1", text)
    text = re.sub(r"\\(mathrm|mathbb|mathbf|mathit|mathcal|text|operatorname)\b", "", text)

    text = re.sub(r"\\([a-zA-Z]+)", r"\1", text)

    text = re.sub(r"\s+", " ", text).strip()

    text = re.sub(r"(\d)\s*([a-zA-Z_(])", r"\1*\2", text)
    text = re.sub(r"(\))\s*([a-zA-Z_(])", r"\1*\2", text)
    text = re.sub(r"(\d)\s*\(", r"\1*(", text)

    text = re.sub(r"([a-zA-Z_][a-zA-Z0-9_]*)\s*\*\s*\(([a-zA-Z])\)", r"\1", text)

    return text


def _parse_latex_expr(latex: str):
    import sympy
    from sympy.parsing.sympy_parser import (
        parse_expr,
        standard_transformations,
        implicit_multiplication_application,
    )

    expr_str = _latex_to_sympy_str(latex)
    if not expr_str:
        raise ValueError("LaTeX 表达式为空")

    local_dict = {
        "pi": sympy.pi,
        "oo": sympy.oo,
        "inf": sympy.oo,
        "e": sympy.E,
        "E": sympy.E,
        "i": sympy.I,
        "I": sympy.I,
    }

    for name in ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
                  "theta", "iota", "kappa", "lambda", "mu", "nu", "xi",
                  "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
                  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma",
                  "Phi", "Psi", "Omega", "varOmega", "varPhi", "varTheta"]:
        local_dict[name] = sympy.Symbol(name)

    for match in re.finditer(r"[a-zA-Z_][a-zA-Z0-9_]*", expr_str):
        token = match.group()
        if token not in local_dict and not hasattr(sympy, token):
            local_dict[token] = sympy.Symbol(token)

    transformations = standard_transformations + (implicit_multiplication_application,)

    try:
        if "=" in expr_str and "==" not in expr_str:
            parts = expr_str.split("=", 1)
            lhs = parse_expr(parts[0].strip(), local_dict=local_dict,
                             transformations=transformations, evaluate=False)
            rhs = parse_expr(parts[1].strip(), local_dict=local_dict,
                             transformations=transformations, evaluate=False)
            return sympy.Eq(lhs, rhs)
        expr = parse_expr(expr_str, local_dict=local_dict,
                          transformations=transformations, evaluate=False)
        return expr
    except Exception as exc:
        raise ValueError(f"无法解析表达式: {expr_str} ({exc})") from exc


def _get_free_symbol(expr):
    import sympy
    free = sorted(expr.free_symbols, key=lambda s: s.name)
    if free:
        return free[0]
    return sympy.Symbol("x")


def _do_compute(expr, operation: str):
    import sympy

    x = _get_free_symbol(expr)
    is_eq = isinstance(expr, sympy.Eq)

    if operation == "solve":
        return sympy.solve(expr, x)

    if is_eq:
        lhs, rhs = expr.lhs, expr.rhs
        if operation == "expand":
            return sympy.Eq(sympy.expand(lhs), sympy.expand(rhs))
        if operation == "factor":
            return sympy.Eq(sympy.factor(lhs), sympy.factor(rhs))
        if operation == "simplify":
            return sympy.Eq(sympy.simplify(lhs), sympy.simplify(rhs))
        if operation == "diff":
            return sympy.Eq(sympy.diff(lhs, x), sympy.diff(rhs, x))
        if operation == "integrate":
            return sympy.Eq(sympy.integrate(lhs, x), sympy.integrate(rhs, x))
        if operation == "limit":
            return sympy.Eq(sympy.limit(lhs, x, sympy.oo), sympy.limit(rhs, x, sympy.oo))
        if operation == "series":
            return sympy.Eq(sympy.series(lhs, x, 0, 10).removeO(), sympy.series(rhs, x, 0, 10).removeO())

    if operation == "expand":
        return sympy.expand(expr)
    if operation == "factor":
        return sympy.factor(expr)
    if operation == "simplify":
        return sympy.simplify(expr)
    if operation == "diff":
        return sympy.diff(expr, x)
    if operation == "integrate":
        return sympy.integrate(expr, x)
    if operation == "limit":
        return sympy.limit(expr, x, sympy.oo)
    if operation == "series":
        return sympy.series(expr, x, 0, 10).removeO()

    raise ValueError(f"不支持的操作: {operation}")


@router.post("/")
async def compute(body: dict):
    settings = get_settings()
    if not settings.enable_computation:
        raise HTTPException(status_code=501, detail="数学计算未启用。请在设置面板中开启。")

    latex = body.get("latex", "").strip()
    operation = body.get("operation", "").strip()

    if not latex:
        raise HTTPException(status_code=400, detail="latex 字段不能为空")
    if len(latex) > MAX_LATEX_LENGTH:
        raise HTTPException(status_code=400, detail=f"LaTeX 表达式过长（最大 {MAX_LATEX_LENGTH} 字符）")
    if not operation:
        raise HTTPException(status_code=400, detail="operation 字段不能为空")

    valid_ops = {"expand", "factor", "simplify", "solve", "diff", "integrate", "limit", "series"}
    if operation not in valid_ops:
        raise HTTPException(status_code=400, detail=f"不支持的操作: {operation}，可用: {', '.join(sorted(valid_ops))}")

    try:
        expr = _parse_latex_expr(latex)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        import sympy

        loop = asyncio.get_running_loop()

        def _run_compute():
            result = _do_compute(expr, operation)
            if isinstance(result, list):
                return ", ".join(sympy.latex(r) for r in result), ", ".join(str(r) for r in result)
            return sympy.latex(result), str(result)

        result_latex, result_text = await asyncio.wait_for(
            loop.run_in_executor(None, _run_compute),
            timeout=COMPUTE_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail=f"计算超时（>{COMPUTE_TIMEOUT_SEC}秒），请简化表达式后重试")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"计算失败: {exc}") from exc

    return success({
        "result_latex": result_latex,
        "result_text": result_text,
        "operation": operation,
    })
