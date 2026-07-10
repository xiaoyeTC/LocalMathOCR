import { useState } from 'react';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { computeFormula, type ComputeResult } from '../services/api';

type Props = {
  latex: string;
  onInsert: (latex: string) => void;
  onToast: (message: string) => void;
};

type Operation = {
  id: string;
  label: string;
  icon: string;
};

const OPERATIONS: Operation[] = [
  { id: 'expand', label: '展开', icon: '⊕' },
  { id: 'factor', label: '因式分解', icon: '⊗' },
  { id: 'simplify', label: '化简', icon: '≡' },
  { id: 'solve', label: '求解', icon: 'x=' },
  { id: 'diff', label: '求导', icon: "f'" },
  { id: 'integrate', label: '积分', icon: '∫' },
  { id: 'limit', label: '极限', icon: 'lim' },
  { id: 'series', label: '级数', icon: '∑' },
];

function renderResult(latex: string): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: true, strict: 'ignore' });
  } catch {
    return latex;
  }
}

export function ComputePanel({ latex, onInsert, onToast }: Props) {
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [resultHtml, setResultHtml] = useState('');
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');

  async function handleCompute(op: string) {
    if (!latex.trim()) {
      onToast('请先输入公式');
      return;
    }
    setComputing(true);
    setError('');
    setResult(null);
    try {
      const res = await computeFormula(latex, op);
      setResult(res);
      setResultHtml(renderResult(res.result_latex));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '计算失败';
      setError(msg);
    } finally {
      setComputing(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5 sm:py-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">数学计算</h3>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {OPERATIONS.map((op) => (
            <button
              key={op.id}
              onClick={() => handleCompute(op.id)}
              disabled={computing}
              className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 px-2 py-2.5 text-xs transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:hover:border-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
            >
              <span className="font-mono text-sm sm:text-base">{op.icon}</span>
              <span className="text-[10px] text-slate-600 dark:text-slate-300 sm:text-xs">{op.label}</span>
            </button>
          ))}
        </div>

        {computing && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            计算中...
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              {OPERATIONS.find((o) => o.id === result.operation)?.label ?? result.operation} 结果
            </div>
            <div
              className="overflow-x-auto text-lg"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resultHtml, { ADD_TAGS: ['math', 'semantics', 'annotation'] }) }}
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onInsert(result.result_latex)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                插入到编辑器
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(result.result_latex);
                  onToast('LaTeX 已复制');
                }}
                className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                复制 LaTeX
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
