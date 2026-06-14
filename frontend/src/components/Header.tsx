import { useState, useRef, useEffect } from 'react';
import type { ModelStatus, OcrModelMetadata } from '../services/api';
import { useThemeStore, COLOR_SCHEMES, type ThemeMode } from '../stores/themeStore';

type Props = {
  modelStatus: ModelStatus;
  models: OcrModelMetadata[];
  selectedModelId: string;
  dark: boolean;
  onToggleDark: () => void;
  onOpenSettings: () => void;
};

export function Header({ modelStatus, models, selectedModelId, dark, onToggleDark, onOpenSettings }: Props) {
  const { mode, colorIndex, setMode, setColorIndex } = useThemeStore();
  const [showTheme, setShowTheme] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setShowTheme(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusClass = modelStatus.status === 'ready' ? 'bg-emerald-500' : modelStatus.status === 'downloading' ? 'bg-amber-500' : 'bg-slate-400';
  const label = modelStatus.status === 'ready' ? '就绪' : modelStatus.status === 'downloading' ? `下载/加载 ${modelStatus.progress}%` : '未启用';
  const requested = modelStatus.requested_device?.toUpperCase();
  const actual = modelStatus.device.toUpperCase();
  const deviceLabel = requested && requested !== actual ? `${requested} → ${actual}` : actual;
  const activeModel = models.find((m) => m.id === selectedModelId);
  const modelName = activeModel?.display_name || selectedModelId;
  const isActive = modelStatus.status === 'ready';

  const themeModes: { value: ThemeMode; label: string }[] = [
    { value: 'classic', label: '卡片' },
    { value: 'modern', label: '下拉' },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-base font-black text-white sm:h-9 sm:w-9 sm:text-lg">L</div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">LocalMathOCR</div>
            <div className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">本地数学公式识别</div>
          </div>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 dark:text-slate-300 md:flex">
          <a href="#recognize" className="hover:text-primary">识别</a>
          <a href="#editor" className="hover:text-primary">编辑器</a>
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={onToggleDark} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:text-slate-100 sm:px-3 sm:py-2">
            {dark ? '☀️' : '🌙'}
          </button>

          <div ref={themeRef} className="relative">
            <button
              onClick={() => setShowTheme(!showTheme)}
              className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-300"
              title="主题设置"
            >
              🎨
            </button>
            {showTheme && (
              <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:w-64">
                <div className="p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">模型选择器样式</div>
                  <div className="flex gap-2">
                    {themeModes.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setMode(m.value)}
                        className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${mode === m.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">主题配色</div>
                  <div className="grid grid-cols-4 gap-2">
                    {COLOR_SCHEMES.map((scheme, i) => (
                      <button
                        key={scheme.name}
                        onClick={() => setColorIndex(i)}
                        className={`group flex flex-col items-center gap-1 rounded-xl p-2 transition ${colorIndex === i ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                        title={scheme.name}
                      >
                        <span className={`h-6 w-6 rounded-full transition-transform ${colorIndex === i ? 'scale-110 ring-2 ring-offset-2 ring-slate-300 dark:ring-slate-600' : 'group-hover:scale-105'}`} style={{ backgroundColor: scheme.primary }} />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{scheme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onOpenSettings}
            className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 dark:text-slate-300"
            title="配置设置"
          >
            ⚙️
          </button>

          <div className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs font-medium sm:gap-2 sm:px-3 sm:py-2 ${isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`} title={modelStatus.message}>
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusClass}`} />
            <span className="hidden sm:inline">{modelName}</span>
            <span className="hidden text-slate-400 dark:text-slate-500 sm:inline">·</span>
            <span>{label}</span>
            <span className="hidden text-slate-400 dark:text-slate-500 sm:inline">·</span>
            <span className="hidden sm:inline">{deviceLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
