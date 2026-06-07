import type { ModelStatus } from '../services/api';

type Props = {
  modelStatus: ModelStatus;
  dark: boolean;
  onToggleDark: () => void;
};

export function Header({ modelStatus, dark, onToggleDark }: Props) {
  const statusClass = modelStatus.status === 'ready' ? 'bg-emerald-500' : modelStatus.status === 'downloading' ? 'bg-amber-500' : 'bg-slate-400';
  const label = modelStatus.status === 'ready' ? '就绪' : modelStatus.status === 'downloading' ? `下载/加载 ${modelStatus.progress}%` : '未启用';
  const requested = modelStatus.requested_device?.toUpperCase();
  const actual = modelStatus.device.toUpperCase();
  const deviceLabel = requested && requested !== actual ? `${requested} → ${actual}` : actual;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-black text-white">L</div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white">LocalMathOCR</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">本地数学公式识别</div>
          </div>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#recognize" className="hover:text-primary">识别</a>
          <a href="#editor" className="hover:text-primary">编辑器</a>
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={onToggleDark} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-100">
            {dark ? '☀️' : '🌙'}
          </button>
          <div className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300" title={modelStatus.message}>
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${statusClass}`} />
            {label} · {deviceLabel}
          </div>
        </div>
      </div>
    </header>
  );
}
