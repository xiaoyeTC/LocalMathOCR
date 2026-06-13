import re
from collections.abc import Callable


class LatexPostProcessor:
    """LaTeX 后处理器：对 OCR 模型输出的原始 LaTeX 进行自动纠错与格式清洗。

    设计为插件化架构——每条修复规则是独立的 _fix_* 方法，统一在
    _rules 列表中注册。增删规则只需修改 _build_rules()，无需改动主逻辑。
    """

    def __init__(self) -> None:
        self._rules: list[Callable[[str], str]] = self._build_rules()

    # ------------------------------------------------------------------
    # 公开接口
    # ------------------------------------------------------------------

    def clean(self, latex: str) -> str:
        """对输入的 LaTeX 字符串依次执行所有后处理规则，返回修正后的结果。"""
        result = latex
        for rule in self._rules:
            result = rule(result)
        return result

    # ------------------------------------------------------------------
    # 规则注册表
    # ------------------------------------------------------------------

    def _build_rules(self) -> list[Callable[[str], str]]:
        """按顺序构建所有修复规则。顺序很重要：先清洗格式，再修复语法。"""
        return [
            self._strip_control_chars,
            self._strip_markdown_wrappers,
            self._normalize_whitespace,
            self._fix_chinese_punctuation,
            self._fix_ocr_hallucinations,
            self._fix_unclosed_braces,
            self._fix_superscript_grouping,
            self._fix_subscript_grouping,
            self._strip_trailing_whitespace,
        ]

    # ------------------------------------------------------------------
    # 格式清洗规则
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_control_chars(latex: str) -> str:
        """移除不可见控制字符（\\x00-\\x08, \\x0B, \\x0C, \\x0E-\\x1F）。
        保留 \\t (\\x09)、\\n (\\x0A)、\\r (\\x0D) 以外的控制字符均删除。
        """
        return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", latex)

    @staticmethod
    def _strip_markdown_wrappers(latex: str) -> str:
        """去除可能由大模型或复制粘贴引入的 Markdown 标记。

        处理场景：
        - 包裹在 ```latex ... ``` 或 ``` ... ``` 中的代码块
        - 行内 `...` 标记
        - 前后残留的 latex 标记
        """
        text = latex.strip()
        # 代码块：```latex ... ``` 或 ``` ... ```
        text = re.sub(r"^```(?:latex)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        # 行内代码标记
        if text.startswith("`") and text.endswith("`") and text.count("`") == 2:
            text = text[1:-1]
        return text.strip()

    @staticmethod
    def _normalize_whitespace(latex: str) -> str:
        """将连续空白字符压缩为单个空格，并去除首尾空白。"""
        return re.sub(r"\s+", " ", latex).strip()

    @staticmethod
    def _strip_trailing_whitespace(latex: str) -> str:
        """最终清理：去除首尾多余空白。"""
        return latex.strip()

    # ------------------------------------------------------------------
    # OCR 幻觉纠错规则
    # ------------------------------------------------------------------

    @staticmethod
    def _fix_chinese_punctuation(latex: str) -> str:
        """将中文标点替换为对应的英文标点。

        OCR 模型在中英混排文档中常误输出中文标点，导致 LaTeX 编译错误。
        """
        replacements = {
            "，": ",",
            "。": ".",
            "；": ";",
            "：": ":",
            "？": "?",
            "！": "!",
            "（": "(",
            "）": ")",
            "【": "[",
            "】": "]",
            "｛": "{",
            "｝": "}",
            "～": "~",
            "＋": "+",
            "－": "-",
            "＝": "=",
            "＜": "<",
            "＞": ">",
            "｜": "|",
            "＊": "*",
            "／": "/",
            "＼": "\\",
            "％": "%",
        }
        for zh, en in replacements.items():
            latex = latex.replace(zh, en)
        return latex

    @staticmethod
    def _fix_ocr_hallucinations(latex: str) -> str:
        """修正常见的 OCR 误识别文本。

        典型场景：
        - 模型将 LaTeX 命令关键字（如 \\alpha）错误输出为纯文本 alpha
        - 误将数学符号识别为相近的 Unicode 字符
        """
        # 常见 LaTeX 命令关键字：如果 OCR 输出了不带反斜杠的纯文本形式，
        # 且周围不是已有 LaTeX 命令的一部分，则补上反斜杠。
        # 使用词边界确保不会误替换已有命令中的片段。
        latex_commands = [
            "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
            "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "pi",
            "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
            "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma",
            "Phi", "Psi", "Omega",
            "infty", "partial", "nabla", "forall", "exists",
            "sin", "cos", "tan", "cot", "sec", "csc",
            "log", "ln", "exp", "lim", "sup", "inf",
            "max", "min", "det", "dim", "mod",
            "cdot", "times", "div", "pm", "mp",
            "leq", "geq", "neq", "approx", "equiv", "sim",
            "subset", "supset", "subseteq", "supseteq",
            "cap", "cup", "in", "notin", "emptyset",
            "rightarrow", "leftarrow", "Rightarrow", "Leftarrow",
            "leftrightarrow", "Leftrightarrow",
            "sum", "prod", "int", "iint", "iiint", "oint",
            "left", "right", "frac", "sqrt", "overline", "underline",
            "hat", "bar", "vec", "dot", "ddot", "tilde",
            "sinh", "cosh", "tanh", "coth",
            "arcsin", "arccos", "arctan",
        ]
        # 匹配：前面不是 \ 或字母，后面是空格或非字母的纯文本关键字
        # 例如 "alpha" 但不匹配 "\alpha" 或 "alphabet"
        pattern = re.compile(
            r"(?<![\\a-zA-Z])(" + "|".join(latex_commands) + r")(?=[^a-zA-Z]|$)"
        )

        def _add_backslash(m: re.Match) -> str:
            return "\\" + m.group(1)

        latex = pattern.sub(_add_backslash, latex)

        # 修正 Unicode 数学符号 -> LaTeX 命令
        unicode_map = {
            "\u221e": "\\infty",       # ∞
            "\u2202": "\\partial",     # ∂
            "\u2207": "\\nabla",       # ∇
            "\u2211": "\\sum",         # ∑
            "\u220f": "\\prod",        # ∏
            "\u222b": "\\int",         # ∫
            "\u00b1": "\\pm",          # ±
            "\u00d7": "\\times",       # ×
            "\u00f7": "\\div",         # ÷
            "\u2260": "\\neq",         # ≠
            "\u2264": "\\leq",         # ≤
            "\u2265": "\\geq",         # ≥
            "\u2248": "\\approx",      # ≈
            "\u2261": "\\equiv",       # ≡
            "\u2192": "\\rightarrow",  # →
            "\u2190": "\\leftarrow",   # ←
            "\u21d2": "\\Rightarrow",  # ⇒
            "\u21d0": "\\Leftarrow",   # ⇐
            "\u221a": "\\sqrt",        # √  (仅作为符号替换，不带参数)
            "\u03c0": "\\pi",          # π
        }
        for char, cmd in unicode_map.items():
            latex = latex.replace(char, cmd)

        return latex

    # ------------------------------------------------------------------
    # 语法规则：括号匹配
    # ------------------------------------------------------------------

    @staticmethod
    def _fix_unclosed_braces(latex: str) -> str:
        """检查并修复 {}、[]、() 的不匹配问题。

        策略：
        - 左括号多于右括号 → 在末尾补全缺失的右括号
        - 右括号多于左括号 → 从末尾移除多余的右括号

        注意：此方法不处理嵌套在 LaTeX 命令参数中的复杂情况，
        仅做最基本的兜底修复，防止前端 KaTeX 渲染崩溃。
        """
        for open_ch, close_ch in [("(", ")"), ("[", "]"), ("{", "}")]:
            depth = 0
            for ch in latex:
                if ch == open_ch:
                    depth += 1
                elif ch == close_ch:
                    depth -= 1
            if depth > 0:
                # 左括号多 → 补右括号
                latex = latex + close_ch * depth
            elif depth < 0:
                # 右括号多 → 从末尾移除多余右括号
                excess = -depth
                result = list(latex)
                for i in range(len(result) - 1, -1, -1):
                    if excess <= 0:
                        break
                    if result[i] == close_ch:
                        result[i] = ""
                        excess -= 1
                latex = "".join(result)
        return latex

    # ------------------------------------------------------------------
    # 语法规则：上下标安全保护
    # ------------------------------------------------------------------

    @staticmethod
    def _fix_superscript_grouping(latex: str) -> str:
        """修复上标 ^ 后面缺少花括号包裹的问题。

        匹配规则：找到 ^ 后面紧跟的 token，如果它不是以 { 开头的分组，
        则将其包裹在 {} 中。

        示例：
        - x^2y    → x^{2}y     （只保护 "2"，"y" 是独立符号）
        - x^12    → x^{12}     （多位数字需要整体包裹）
        - x^{ab}  → 不变        （已有花括号）
        - x^\\alpha → 不变      （反斜杠命令整体作为 token）
        """
        # ^ 后面的 token 可以是：
        #   1. 一个 { 开头的分组 → 跳过
        #   2. 一个 \ 开头的命令（如 \alpha）→ 整个命令作为一个 token
        #   3. 一个或多个普通字符（字母/数字）→ 取第一个字符
        # 我们用 (?!\{) 排除已有分组的情况，用捕获组提取需要保护的 token
        pattern = re.compile(
            r"\^"                           # 上标符号
            r"(?!\{)"                       # 后面不是 {（已有分组则跳过）
            r"("                            # 开始捕获需要保护的 token
            r"\\[a-zA-Z]+"                  #   情况A：\command 形式
            r"|[0-9]+"                      #   情况B：连续数字
            r"|[a-zA-Z](?![a-zA-Z])"        #   情况C：单个字母（后面不跟字母）
            r")"
        )
        return pattern.sub(r"^{\1}", latex)

    @staticmethod
    def _fix_subscript_grouping(latex: str) -> str:
        """修复下标 _ 后面缺少花括号包裹的问题。

        规则与上标一致，参见 _fix_superscript_grouping 的注释。
        """
        pattern = re.compile(
            r"_"
            r"(?!\{)"
            r"("
            r"\\[a-zA-Z]+"
            r"|[0-9]+"
            r"|[a-zA-Z](?![a-zA-Z])"
            r")"
        )
        return pattern.sub(r"_{\1}", latex)


# 模块级单例，避免每次请求重复创建对象
post_processor = LatexPostProcessor()
