import { useEffect, useRef, useState, type CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { exportFormulaText, exportFormulaFile } from '../services/api';

type Props = {
  latex: string;
  onToast: (message: string) => void;
};

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

type PreviewState = {
  html: string;
  error: string;
};

function renderLatex(latex: string): PreviewState {
  const value = latex.trim();
  if (!value) return { html: '', error: '' };
  try {
    return {
      html: katex.renderToString(value, { throwOnError: true, displayMode: true, strict: 'ignore', output: 'htmlAndMathml' }),
      error: '',
    };
  } catch (err) {
    return { html: '', error: err instanceof Error ? err.message : 'LaTeX syntax error' };
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
        if (text.includes('katex') && !text.startsWith('@font-face')) {
          rules.push(text);
        }
      }
    } catch {
      // cross-origin stylesheets are not accessible
    }
  }

  if (fontStack) {
    rules.push(`.katex, .katex * { font-family: ${fontStack} !important; }`);
  }
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

  const foreignObject = document.createElementNS(svgNs, 'foreignObject');
  foreignObject.setAttribute('width', '100%');
  foreignObject.setAttribute('height', '100%');

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

  foreignObject.appendChild(root);
  svg.appendChild(foreignObject);
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

export function PreviewPane({ latex, onToast }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<PreviewState>({ html: '', error: '' });
  const [exportFont, setExportFont] = useState(EXPORT_FONTS[0].value);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const selectedFont = EXPORT_FONTS.find((font) => font.value === exportFont) ?? EXPORT_FONTS[0];
  const previewFontStyle = selectedFont.stack
    ? ({ '--formula-font-family': selectedFont.stack, fontFamily: selectedFont.stack } as CSSProperties)
    : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreview(renderLatex(latex));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [latex]);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportOpen]);

  function ensureExportable(): boolean {
    if (preview.error) {
      onToast('当前 LaTeX 有语法问题，请先修正后再导出');
      return false;
    }
    if (!preview.html) {
      onToast('暂无可导出的公式');
      return false;
    }
    return true;
  }

  function buildSvgForeignObject(html: string): { svg: string; width: number; height: number } {
    const container = buildExportContainer(html, selectedFont.stack);
    try {
      const inner = container.firstElementChild as HTMLElement;
      const formula = inner.firstElementChild as HTMLElement;
      const rect = formula.getBoundingClientRect();
      const padX = 48;
      const padY = 48;
      const width = Math.ceil(rect.width + padX);
      const height = Math.ceil(rect.height + padY);
      const css = collectExportCss(selectedFont.stack);
      const svg = buildSvgDocument(html, width, height, css, selectedFont.stack);

      return { svg, width, height };
    } finally {
      document.body.removeChild(container);
    }
  }

  async function exportPng() {
    if (!ensureExportable()) return;
    try {
      const { svg, width, height } = buildSvgForeignObject(preview.html);
      const scale = window.devicePixelRatio || 2;
      const canvas = await svgToCanvas(svg, width, height, scale);
      const link = document.createElement('a');
      link.download = 'formula.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      onToast('PNG 已导出');
    } catch {
      onToast('PNG 导出失败，请重试');
    }
  }

  async function exportSvg() {
    if (!ensureExportable()) return;
    try {
      const { svg } = buildSvgForeignObject(preview.html);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, 'formula.svg');
      onToast('SVG 已导出');
    } catch {
      onToast('SVG 导出失败，请重试');
    }
  }

  async function handleExport(format: string, needsBackend: boolean) {
    setExportOpen(false);
    if (!latex.trim()) {
      onToast('暂无可导出的公式');
      return;
    }
    setExporting(true);
    try {
      if (format === 'mathml') {
        const mathml = katex.renderToString(latex, { throwOnError: true, displayMode: true, strict: 'ignore', output: 'mathml' });
        await navigator.clipboard.writeText(mathml);
        onToast('MathML 已复制到剪贴板');
      } else if (!needsBackend) {
        const result = await exportFormulaText(format, latex);
        await navigator.clipboard.writeText(result.content);
        onToast('已复制到剪贴板');
      } else {
        const ext = format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : 'html';
        const blob = await exportFormulaFile(format, latex);
        downloadBlob(blob, `formula.${ext}`);
        onToast(`${format.toUpperCase()} 已导出`);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="flex min-h-[280px] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[420px]">
      <style>{'.formula-preview-font .katex, .formula-preview-font .katex * { font-family: var(--formula-font-family) !important; }'}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5 sm:py-4">
        <h3 className="font-bold text-slate-900 dark:text-white">实时预览</h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <select
            value={exportFont}
            onChange={(event) => setExportFont(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="导出字体"
          >
            {EXPORT_FONTS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
          <button onClick={exportPng} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">PNG</button>
          <button onClick={exportSvg} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">SVG</button>
          <div ref={exportMenuRef} className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              disabled={exporting}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {exporting ? '导出中...' : '导出'}
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                {EXPORT_FORMATS.map((group) => (
                  <div key={group.group}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{group.group}</div>
                    {group.items.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => handleExport(item.value, item.needsBackend)}
                        className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        {item.label}
                      </button>
                    ))}
                    <div className="mx-2 border-t border-slate-100 dark:border-slate-700" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto rounded-b-3xl bg-white p-8 text-slate-900">
        {preview.error ? (
          <div className="max-w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
            <p className="font-semibold">LaTeX 语法需要修正，暂不渲染/导出。</p>
            <p className="mt-2 break-all font-mono text-xs text-slate-700">{latex}</p>
          </div>
        ) : preview.html ? (
          <div
            ref={previewRef}
            className="formula-preview-font inline-block text-2xl"
            style={previewFontStyle}
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <div className="text-sm text-slate-400">请输入或识别 LaTeX 公式</div>
        )}
      </div>
    </section>
  );
}
