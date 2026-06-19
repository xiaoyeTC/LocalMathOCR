import type { OcrModelMetadata } from '../services/api';
import { displayModel } from './modelData';

type Props = {
  models: OcrModelMetadata[];
  selectedModelId: string;
  disabled?: boolean;
  onChange: (modelId: string) => void | Promise<void>;
};

export function ModelSelector({ models, selectedModelId, disabled, onChange }: Props) {
  if (models.length === 0) {
    return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">模型选择</div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">正在加载可用模型列表...</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">模型选择</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">按图片复杂度和硬件显存选择 OCR 引擎</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((rawModel) => {
          const model = displayModel(rawModel);
          const selected = model.id === selectedModelId;
          const risky = model.id === 'uni_equation' || model.vram_requirement.includes('>');
          const disabledByState = disabled || model.status !== 'ready';
          return (
            <button
              key={model.id}
              type="button"
              disabled={disabledByState}
              onClick={() => onChange(model.id)}
              title={`${model.description} 显存需求：${model.vram_requirement}`}
              className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? 'border-primary bg-blue-50 shadow-sm dark:bg-blue-950/40'
                  : 'border-slate-200 bg-slate-50 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-white">{model.display_name}</div>
                {selected && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">当前</span>}
              </div>
              <p className="mt-2 min-h-16 text-sm leading-6 text-slate-600 dark:text-slate-300">{model.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs ${risky ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'}`}>
                  显存：{model.vram_requirement}
                </span>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {model.status === 'ready' ? (model.active ? '当前使用' : '可切换') : model.status === 'downloading' ? `下载中 ${model.progress}%` : '未启用'}
                </span>
              </div>
              {model.status === 'downloading' && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${model.progress}%` }} />
                </div>
              )}
              {model.status === 'unavailable' && <p className="mt-3 text-xs text-slate-400">未启用：{model.message}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.strengths.map((item) => (
                  <span key={item} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    {item}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
