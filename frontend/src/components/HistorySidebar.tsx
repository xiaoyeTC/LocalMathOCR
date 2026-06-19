import type { HistoryItem } from '../services/api';

type Props = {
  history: HistoryItem[];
  onSelect: (latex: string) => void;
  onDelete: (id: number) => void;
  onClear: () => void;
};

export function HistorySidebar({ history, onSelect, onDelete, onClear }: Props) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">历史记录</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{history.length} 条</span>
          <button
            onClick={onClear}
            disabled={history.length === 0}
            className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300 dark:hover:bg-red-950/30"
          >
            清空
          </button>
        </div>
      </div>
      <div className="max-h-[400px] space-y-2 overflow-auto pr-1 sm:max-h-[620px] sm:space-y-3">
        {history.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">暂无识别历史</p>}
        {history.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            {item.image_base64 && <img src={item.image_base64} alt="formula" className="mb-2 h-20 w-full rounded-xl object-contain bg-slate-50 dark:bg-slate-950" />}
            <button onClick={() => onSelect(item.latex)} className="block w-full truncate text-left font-mono text-sm text-slate-700 hover:text-primary dark:text-slate-200" title={item.latex}>
              {item.latex}
            </button>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{new Date(item.created_at).toLocaleString()}</span>
              <button onClick={() => onDelete(item.id)} className="text-red-500 hover:text-red-600">删除</button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
