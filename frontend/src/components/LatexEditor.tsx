import { useRef, useEffect, useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { EditorView } from '@codemirror/view';
import 'mathlive';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCopy: () => void;
};

type EditorMode = 'visual' | 'source';

export function LatexEditor({ value, onChange, onCopy }: Props) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const mfRef = useRef<HTMLElement & { setValue?: (v: string) => void; value?: string }>(null);
  const lastPushedRef = useRef<string>('');

  useEffect(() => {
    if (mode !== 'visual') return;
    const mf = mfRef.current;
    if (!mf || typeof mf.setValue !== 'function') return;
    if (mf.value !== value && lastPushedRef.current !== value) {
      mf.setValue(value);
    }
  }, [value, mode]);

  const handleMathFieldInput = useCallback(() => {
    const mf = mfRef.current;
    if (!mf) return;
    const latex = mf.value ?? '';
    lastPushedRef.current = latex;
    onChange(latex);
  }, [onChange]);

  return (
    <section id="editor" className="flex min-h-[280px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[420px]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 dark:text-white">📝 LaTeX 编辑器</h3>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setMode('visual')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'visual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              可视化
            </button>
            <button
              onClick={() => setMode('source')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'source' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              源码
            </button>
          </div>
        </div>
        <button onClick={onCopy} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">复制</button>
      </div>
      <div className="flex-1">
        {mode === 'visual' ? (
          <div className="h-full p-3 sm:p-4">
            <math-field
              ref={mfRef as React.Ref<HTMLElement>}
              onInput={handleMathFieldInput}
              style={{
                width: '100%',
                minHeight: '200px',
                fontSize: '1.25em',
                padding: '8px',
              }}
            />
          </div>
        ) : (
          <CodeMirror
            value={value}
            height="240px"
            extensions={[StreamLanguage.define(stex), EditorView.lineWrapping]}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
            onChange={onChange}
            theme="light"
          />
        )}
      </div>
    </section>
  );
}
