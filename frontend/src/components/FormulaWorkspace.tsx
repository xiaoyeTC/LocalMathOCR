import { useRef, useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { EditorView } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'mathlive';
import 'mathlive/fonts.css';
import { exportFormulaText, exportFormulaFile } from '../services/api';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  onToast: (message: string) => void;
};

type EditorMode = 'visual' | 'source';

type ExportFont = {
  label: string;
  value: string;
  stack: string;
};

const EXPORT_FONTS: ExportFont[] = [
  { label: 'Times New Roman', value: 'times', stack: '"Times New Roman", Times, serif' },
  { label: 'KaTeX 内置', value: 'katex', stack: '' },
  { label: 'Cambria Math', value: 'cambria', stack: '"Cambria Math", Cambria, serif' },
  { label: 'Georgia', value: 'georgia', stack: 'Georgia, "Times New Roman", serif' },
  { label: 'STIX Two Math', value: 'stix', stack: '"STIX Two Math", "STIX Two Text", "Times New Roman", serif' },
  { label: 'Latin Modern Math', value: 'latin-modern', stack: '"Latin Modern Math", "Latin Modern Roman", "Times New Roman", serif' },
  { label: 'Arial', value: 'arial', stack: 'Arial, Helvetica, sans-serif' },
];

type ExportFormatGroup = {
  group: string;
  items: { label: string; value: string; needsBackend: boolean }[];
};

const EXPORT_FORMATS: ExportFormatGroup[] = [
  {
    group: '图片',
    items: [
      { label: 'PNG', value: 'png', needsBackend: false },
      { label: 'SVG', value: 'svg', needsBackend: false },
    ],
  },
  {
    group: 'LaTeX',
    items: [
      { label: 'LaTeX (inline)', value: 'latex-inline', needsBackend: false },
      { label: 'LaTeX (display)', value: 'latex-display', needsBackend: false },
      { label: 'LaTeX (equation)', value: 'latex-equation', needsBackend: false },
    ],
  },
  {
    group: 'Markdown',
    items: [
      { label: 'Markdown (inline)', value: 'markdown-inline', needsBackend: false },
      { label: 'Markdown (block)', value: 'markdown-block', needsBackend: false },
    ],
  },
  {
    group: '文档',
    items: [
      { label: 'MathML', value: 'mathml', needsBackend: false },
      { label: 'HTML', value: 'html', needsBackend: true },
      { label: 'Word (.docx)', value: 'docx', needsBackend: true },
      { label: 'PDF', value: 'pdf', needsBackend: true },
      { label: 'Plain Text', value: 'text', needsBackend: false },
    ],
  },
];

type TemplateItem = {
  label: string;
  icon: string;
  insert: string;
  cursorOffset: number;
};

const TEMPLATES: TemplateItem[] = [
  { label: '分数', icon: 'ᵃ⁄ᵦ', insert: '\\frac{}{}', cursorOffset: 6 },
  { label: '根号', icon: '√‾', insert: '\\sqrt{}', cursorOffset: 6 },
  { label: '上标', icon: 'x²', insert: '^{}', cursorOffset: 2 },
  { label: '下标', icon: 'x₂', insert: '_{}', cursorOffset: 2 },
  { label: '求和', icon: '∑', insert: '\\sum_{i=1}^{n}', cursorOffset: 5 },
  { label: '积分', icon: '∫', insert: '\\int_{a}^{b}', cursorOffset: 5 },
  { label: '矩阵', icon: '▦', insert: '\\begin{pmatrix}\n  & \\\\\n  & \n\\end{pmatrix}', cursorOffset: 16 },
];

type PreviewState = {
  html: string;
  error: string;
  parsedError: ParsedError | null;
};

function renderLatex(latex: string): PreviewState {
  const v = latex.trim();
  if (!v) return { html: '', error: '', parsedError: null };
  try {
    return {
      html: katex.renderToString(v, { throwOnError: true, displayMode: true, strict: 'ignore', output: 'htmlAndMathml' }),
      error: '',
      parsedError: null,
    };
  } catch (err) {
    return { html: '', error: err instanceof Error ? err.message : 'LaTeX syntax error', parsedError: parseKatexError(err, v) };
  }
}

function buildExportContainer(html: string, fontStack: string): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-block;padding:24px;background:#fff;';
  const formula = document.createElement('div');
  formula.style.cssText = 'font-size:1.5rem;line-height:2rem;color:#0f172a;';
  if (fontStack) formula.style.fontFamily = fontStack;
  formula.innerHTML = html;
  if (fontStack) {
    const style = document.createElement('style');
    style.textContent = `.katex, .katex * { font-family: ${fontStack} !important; }`;
    formula.prepend(style);
  }
  wrapper.appendChild(formula);
  container.appendChild(wrapper);
  document.body.appendChild(container);
  return container;
}

function svgToDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function svgToCanvas(svgString: string, width: number, height: number, scale: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Failed to render SVG to canvas'));
    img.src = svgToDataUrl(svgString);
  });
}

function collectExportCss(fontStack: string): string {
  const rules: string[] = [
    '.katex { font-size: 1.5rem; line-height: 1.2; color: #0f172a; }',
    '.katex-display { margin: 0; }',
  ];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const text = rule.cssText;
        if (text.includes('katex') && !text.startsWith('@font-face')) rules.push(text);
      }
    } catch { /* cross-origin */ }
  }
  if (fontStack) rules.push(`.katex, .katex * { font-family: ${fontStack} !important; }`);
  return rules.join('\n');
}

function buildSvgDocument(html: string, width: number, height: number, css: string, fontStack: string): string {
  const svgNs = 'http://www.w3.org/2000/svg';
  const xhtmlNs = 'http://www.w3.org/1999/xhtml';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('xmlns', svgNs);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const fo = document.createElementNS(svgNs, 'foreignObject');
  fo.setAttribute('width', '100%');
  fo.setAttribute('height', '100%');
  const root = document.createElementNS(xhtmlNs, 'div');
  root.setAttribute('xmlns', xhtmlNs);
  root.setAttribute('style', `width:${width}px;height:${height}px;background:#fff;display:flex;align-items:center;justify-content:center;`);
  const style = document.createElementNS(xhtmlNs, 'style');
  style.textContent = css;
  root.appendChild(style);
  const formula = document.createElementNS(xhtmlNs, 'div');
  formula.setAttribute('style', `padding:24px;color:#0f172a;${fontStack ? `font-family:${fontStack};` : ''}`);
  formula.innerHTML = html;
  root.appendChild(formula);
  fo.appendChild(root);
  svg.appendChild(fo);
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeMathliveLatex(latex: string): string {
  let out = latex;
  out = out.replace(/\b\\exponentialE\b/g, 'e');
  out = out.replace(/\b\\imaginaryI\b/g, 'i');
  out = out.replace(/\b\\differentialD\b/g, '\\mathrm{d}');
  out = out.replace(/\b\\capitalDifferentialD\b/g, '\\mathrm{D}');
  out = out.replace(/\\operatorname\*?\{([^}]*)\}/g, '\\mathrm{$1}');
  out = out.replace(/\\char"([0-9A-Fa-f]+)\b/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  out = out.replace(/\\varepsilon\b/g, '\\epsilon');
  out = out.replace(/\\varphi\b/g, '\\phi');
  out = out.replace(/\\vartheta\b/g, '\\theta');
  out = out.replace(/\\varsigma\b/g, '\\sigma');
  out = out.replace(/\\varrho\b/g, '\\rho');
  out = out.replace(/(?<![a-zA-Z])\\i\b(?![a-zA-Z])/g, 'i');
  out = out.replace(/(?<![a-zA-Z])\\j\b(?![a-zA-Z])/g, 'j');
  return out;
}

type ParsedError = {
  message: string;
  line: number;
  column: number;
  position: number;
};

function parseKatexError(err: unknown, latex: string): ParsedError | null {
  if (!(err instanceof Error)) return null;
  const msg = err.message;
  const posMatch = msg.match(/position\s+(\d+)/i);
  const pos = posMatch ? parseInt(posMatch[1], 10) : 0;
  const lines = latex.slice(0, pos).split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1] ?? '').length + 1;
  const cleanMsg = msg.replace(/\s*\(.*?\)\s*$/, '').replace(/&nbsp;/g, ' ').trim();
  return { message: cleanMsg, line, column, position: pos };
}

const TYPO_FIXES: [RegExp, string][] = [
  [/\\pii\b/g, '\\pi'],
  [/\\sqr\b/g, '\\sqrt'],
  [/\\bet\b/g, '\\beta'],
  [/\\gama\b/g, '\\gamma'],
  [/\\lamba\b/g, '\\lambda'],
  [/\\inf\b(?!ty)/g, '\\infty'],
  [/\\sum\b_\{([^}]*)\}\^\{([^}]*)\}([^_^\s])/g, '\\sum_{$1}^{$2} $3'],
];

function autoFixLatex(latex: string): string {
  let out = latex;
  for (const [pattern, replacement] of TYPO_FIXES) {
    out = out.replace(pattern, replacement);
  }
  const openBraces = (out.match(/\{/g) || []).length;
  const closeBraces = (out.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    out += '}'.repeat(openBraces - closeBraces);
  }
  return out;
}

function createKatexLinter(valueRef: React.MutableRefObject<string>) {
  return linter(() => {
    const v = valueRef.current.trim();
    if (!v) return [];
    try {
      katex.renderToString(v, { throwOnError: true, displayMode: true, strict: 'ignore' });
      return [];
    } catch (err) {
      const parsed = parseKatexError(err, v);
      if (!parsed) return [];
      const diag: Diagnostic = {
        from: Math.min(parsed.position, v.length),
        to: Math.min(parsed.position + 1, v.length),
        severity: 'error',
        message: parsed.message,
      };
      return [diag];
    }
  }, { delay: 500 });
}

export function FormulaWorkspace({ value, onChange, onCopy, onToast }: Props) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [exportFont, setExportFont] = useState(EXPORT_FONTS[0].value);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ html: '', error: '', parsedError: null });

  const mfRef = useRef<HTMLElement | null>(null);
  const lastPushedRef = useRef<string>('');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedFont = EXPORT_FONTS.find((f) => f.value === exportFont) ?? EXPORT_FONTS[0];
  const previewFontStyle = selectedFont.stack
    ? ({ '--formula-font-family': selectedFont.stack, fontFamily: selectedFont.stack } as CSSProperties)
    : undefined;

  const handleChange = useCallback(
    (rawLatex: string) => {
      const latex = normalizeMathliveLatex(rawLatex);
      lastPushedRef.current = latex;
      onChange(latex);
    },
    [onChange],
  );

  const latexValueRef = useRef(value);
  latexValueRef.current = value;
  const katexLinter = useMemo(() => createKatexLinter(latexValueRef), []);

  const handleAutoFix = useCallback(() => {
    const fixed = autoFixLatex(value);
    if (fixed !== value) {
      onChange(fixed);
      onToast('已自动修复常见错误');
    } else {
      onToast('未发现可自动修复的错误');
    }
  }, [value, onChange, onToast]);

  useEffect(() => {
    if (mode !== 'visual') return;
    const mf = mfRef.current;
    if (!mf) return;
    let disposed = false;
    let attachedHandler: (() => void) | null = null;
    function attach() {
      if (disposed) return;
      const el = mf as (HTMLElement & { setValue?: (v: string) => void; value?: string }) | null;
      if (!el || typeof el.setValue !== 'function') {
        requestAnimationFrame(attach);
        return;
      }
      if (attachedHandler) return;
      attachedHandler = () => handleChange(el.value ?? '');
      el.addEventListener('input', attachedHandler);
      if (value) el.setValue(value);
    }
    attach();
    return () => {
      disposed = true;
      if (attachedHandler) {
        const el = mf as (HTMLElement & { removeEventListener?: (type: string, handler: EventListener) => void }) | null;
        el?.removeEventListener?.('input', attachedHandler);
      }
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'visual') return;
    const mf = mfRef.current as (HTMLElement & { setValue?: (v: string) => void; value?: string }) | null;
    if (!mf || typeof mf.setValue !== 'function') return;
    if (mf.value !== value && lastPushedRef.current !== value) mf.setValue(value);
  }, [value, mode]);

  useEffect(() => {
    if (mode !== 'source') return;
    const timer = window.setTimeout(() => setPreview(renderLatex(value)), 250);
    return () => window.clearTimeout(timer);
  }, [value, mode]);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  function insertTemplate(tpl: TemplateItem) {
    const latex = tpl.insert;
    if (mode === 'source') {
      handleChange(value + latex);
    } else {
      const mf = mfRef.current as (HTMLElement & { insert?: (v: string) => void }) | null;
      if (mf && typeof mf.insert === 'function') {
        mf.insert(latex);
      } else {
        handleChange(value + latex);
      }
    }
    setTemplatesOpen(false);
  }

  function getExportHtml(): string | null {
    if (preview.html) return preview.html;
    const v = value.trim();
    if (!v) return null;
    try {
      return katex.renderToString(v, { throwOnError: true, displayMode: true, strict: 'ignore', output: 'htmlAndMathml' });
    } catch {
      return null;
    }
  }

  function ensureExportable(): boolean {
    const html = getExportHtml();
    if (!html) { onToast('暂无可导出的公式'); return false; }
    return true;
  }

  function buildSvgForeignObject(html: string): { svg: string; width: number; height: number } {
    const container = buildExportContainer(html, selectedFont.stack);
    try {
      const inner = container.firstElementChild as HTMLElement;
      const formula = inner.firstElementChild as HTMLElement;
      const rect = formula.getBoundingClientRect();
      const width = Math.ceil(rect.width + 48);
      const height = Math.ceil(rect.height + 48);
      const css = collectExportCss(selectedFont.stack);
      return { svg: buildSvgDocument(html, width, height, css, selectedFont.stack), width, height };
    } finally {
      document.body.removeChild(container);
    }
  }

  async function exportPng() {
    if (!ensureExportable()) return;
    try {
      const html = getExportHtml()!;
      const { svg, width, height } = buildSvgForeignObject(html);
      const canvas = await svgToCanvas(svg, width, height, window.devicePixelRatio || 2);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
      });
      downloadBlob(blob, 'formula.png');
      onToast('PNG 已导出');
    } catch { onToast('PNG 导出失败'); }
  }

  async function exportSvg() {
    if (!ensureExportable()) return;
    try {
      const html = getExportHtml()!;
      const { svg } = buildSvgForeignObject(html);
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'formula.svg');
      onToast('SVG 已导出');
    } catch { onToast('SVG 导出失败'); }
  }

  async function handleExport(format: string, needsBackend: boolean) {
    setExportOpen(false);
    if (!value.trim()) { onToast('暂无可导出的公式'); return; }
    setExporting(true);
    try {
      if (format === 'png') {
        await exportPng();
      } else if (format === 'svg') {
        await exportSvg();
      } else if (format === 'mathml') {
        const mathml = katex.renderToString(value, { throwOnError: true, displayMode: true, strict: 'ignore', output: 'mathml' });
        await navigator.clipboard.writeText(mathml);
        onToast('MathML 已复制');
      } else if (!needsBackend) {
        const result = await exportFormulaText(format, value);
        await navigator.clipboard.writeText(result.content);
        onToast('已复制到剪贴板');
      } else {
        const ext = format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'html';
        downloadBlob(await exportFormulaFile(format, value), `formula.${ext}`);
        onToast(`${format.toUpperCase()} 已导出`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败';
      if (msg.includes('Pandoc') || msg.includes('pandoc')) {
        onToast('此格式需要 Pandoc，请在设置面板中启用并安装 Pandoc');
      } else {
        onToast(msg);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <style>{'.formula-preview-font .katex, .formula-preview-font .katex * { font-family: var(--formula-font-family) !important; }'}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-2.5 py-2 dark:border-slate-800 sm:flex-nowrap sm:gap-2 sm:px-5 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <h3 className="hidden text-sm font-bold text-slate-900 dark:text-white sm:block sm:text-base">公式工作区</h3>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700">
            <button onClick={() => setMode('visual')} className={`px-2 py-1 text-xs font-medium transition-colors ${mode === 'visual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>可视化</button>
            <button onClick={() => setMode('source')} className={`px-2 py-1 text-xs font-medium transition-colors ${mode === 'source' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>源码</button>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setTemplatesOpen(!templatesOpen)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:text-sm">
            模板
            <svg className={`h-3 w-3 transition-transform ${templatesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {templatesOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800" style={{ width: '280px' }}>
              {TEMPLATES.map((tpl) => (
                <button key={tpl.label} onClick={() => insertTemplate(tpl)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300" title={tpl.insert}>
                  <span className="font-mono text-base">{tpl.icon}</span>
                  <span className="text-xs">{tpl.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <select value={exportFont} onChange={(e) => setExportFont(e.target.value)} className="hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:block sm:text-sm" title="导出字体">
            {EXPORT_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <button onClick={onCopy} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 sm:text-sm">复制</button>
          <div ref={exportMenuRef} className="relative">
            <button onClick={() => setExportOpen(!exportOpen)} disabled={exporting} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:text-sm">
              {exporting ? '...' : '导出 ▾'}
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="max-h-80 overflow-y-auto py-1">
                  {EXPORT_FORMATS.map((group, gi) => (
                    <div key={group.group}>
                      {gi > 0 && <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-700" />}
                      <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{group.group}</div>
                      {group.items.map((item) => (
                        <button key={item.value} onClick={() => handleExport(item.value, item.needsBackend)} className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-blue-900/30">{item.label}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editor (+ Preview in source mode only) */}
      {mode === 'visual' ? (
        <div className="min-h-[320px] p-3 sm:p-4">
          {/* @ts-expect-error math-field is a MathLive custom element */}
          <math-field ref={mfRef} style={{ width: '100%', minHeight: '280px', fontSize: '1.25em', padding: '8px', backgroundColor: 'inherit', color: 'inherit' }} />
        </div>
      ) : (
        <div className="grid min-h-[320px] lg:grid-cols-2">
          <div className="flex flex-col border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <div className="flex-1">
              <CodeMirror value={value} height="280px" extensions={[StreamLanguage.define(stex), EditorView.lineWrapping, katexLinter]} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={onChange} theme="light" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex flex-1 items-center justify-center overflow-auto bg-white p-6 text-slate-900 dark:bg-slate-900 sm:p-8">
              {preview.error ? (
                <div className="max-w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                  <p className="font-semibold">LaTeX 语法需要修正</p>
                  {preview.parsedError && (
                    <p className="mt-1 text-xs text-amber-700">
                      位置：第 {preview.parsedError.line} 行，第 {preview.parsedError.column} 列
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-600">{preview.parsedError?.message ?? preview.error}</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-700">{value}</p>
                  <button onClick={handleAutoFix} className="mt-2 rounded-lg bg-amber-200 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300">一键修复</button>
                </div>
              ) : preview.html ? (
                <div ref={previewRef} className="formula-preview-font inline-block text-2xl" style={previewFontStyle} dangerouslySetInnerHTML={{ __html: preview.html }} />
              ) : (
                <div className="text-sm text-slate-400">请输入公式</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
