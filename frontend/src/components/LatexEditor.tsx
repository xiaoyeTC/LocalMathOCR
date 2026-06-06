import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { EditorView } from '@codemirror/view';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onCopy: () => void;
};

export function LatexEditor({ value, onChange, onCopy }: Props) {
  return (
    <section id="editor" className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h3 className="font-bold text-slate-900 dark:text-white">📝 LaTeX 源码</h3>
        <button onClick={onCopy} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">复制</button>
      </div>
      <div className="flex-1">
        <CodeMirror
          value={value}
          height="360px"
          extensions={[StreamLanguage.define(stex), EditorView.lineWrapping]}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={onChange}
          theme="light"
        />
      </div>
    </section>
  );
}
