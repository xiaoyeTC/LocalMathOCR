import { useState, useRef, useEffect } from 'react';
import type { OcrModelMetadata } from '../services/api';

type Props = {
  models: OcrModelMetadata[];
  selectedModelId: string;
  disabled?: boolean;
  onChange: (modelId: string) => void | Promise<void>;
};

const fallbackCopy: Record<string, Pick<OcrModelMetadata, 'display_name' | 'description' | 'vram_requirement' | 'strengths'>> = {
  pix2text: {
    display_name: '基础版 (Pix2Text)',
    description: '🚀 轻量高效，支持 CPU 运行。基于 P2T MFR 模型，适合单行公式和清晰截图。',
    vram_requirement: '<1GB',
    strengths: ['CPU 友好', '单行公式', '清晰截图', '快速识别'],
  },
  latex_ocr: {
    display_name: '高精度版 (LaTeX_OCR)',
    description: '🎯 准确率大幅提升。适合包含上下标、希腊字母的常规复杂公式。推荐 GPU 运行。',
    vram_requirement: '2GB+',
    strengths: ['上下标', '希腊字母', '常规复杂公式', 'GPU 推荐'],
  },
  uni_equation: {
    display_name: '专业版 (Uni-Equation)',
    description: '🧠 复杂结构克星。专为多层嵌套分数、大型矩阵、物理/化学长公式优化。',
    vram_requirement: '6GB+',
    strengths: ['嵌套分数', '大型矩阵', '长公式'],
  },
};

function displayModel(model: OcrModelMetadata) {
  const fallback = fallbackCopy[model.id];
  return {
    ...model,
    display_name: model.display_name || fallback?.display_name || model.id,
    description: model.description || fallback?.description || '本地公式识别模型',
    vram_requirement: model.vram_requirement || fallback?.vram_requirement || '未知',
    strengths: model.strengths?.length ? model.strengths : fallback?.strengths || [],
  };
}

export function ModelSelectorDropdown({ models, selectedModelId, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = models.find((m) => m.id === selectedModelId);
  const selectedDisplay = selected ? displayModel(selected) : null;

  const statusColor = (status: string) =>
    status === 'ready' ? 'bg-emerald-500' : status === 'downloading' ? 'bg-amber-500' : 'bg-slate-400';
  const statusLabel = (model: OcrModelMetadata) =>
    model.status === 'ready' ? (model.active ? '当前使用' : '可切换') : model.status === 'downloading' ? `下载中 ${model.progress}%` : '未启用';

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">模型选择</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">按图片复杂度和硬件选择 OCR 引擎</p>
        </div>
      </div>

      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-primary dark:border-slate-700 dark:bg-slate-950 dark:hover:border-primary"
        >
          <div className="flex items-center gap-3 min-w-0">
            {selectedDisplay && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(selectedDisplay.status)}`} />}
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {selectedDisplay?.display_name || '选择模型'}
              </div>
              {selectedDisplay && (
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  显存：{selectedDisplay.vram_requirement} · {statusLabel(selectedDisplay)}
                </div>
              )}
            </div>
          </div>
          <svg className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>

        {selectedDisplay && selectedDisplay.status === 'downloading' && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-amber-700 dark:text-amber-300">{selectedDisplay.display_name}</span>
              <span className="text-amber-600 dark:text-amber-400">{selectedDisplay.progress}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-800">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${selectedDisplay.progress}%` }} />
            </div>
            {selectedDisplay.message && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 truncate">{selectedDisplay.message}</p>}
          </div>
        )}

        {open && (
          <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {models.map((rawModel) => {
              const model = displayModel(rawModel);
              const selected = model.id === selectedModelId;
              const disabledByState = disabled || model.status !== 'ready';
              return (
                <button
                  key={model.id}
                  type="button"
                  disabled={disabledByState}
                  onClick={() => { onChange(model.id); setOpen(false); }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? 'bg-primary-light dark:bg-primary-light/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(model.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">{model.display_name}</span>
                      {selected && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">当前</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{model.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        显存：{model.vram_requirement}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${model.status === 'ready' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : model.status === 'downloading' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {statusLabel(model)}
                      </span>
                    </div>
                    {model.status === 'downloading' && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${model.progress}%` }} />
                      </div>
                    )}
                    {model.strengths.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {model.strengths.map((s) => (
                          <span key={s} className="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
