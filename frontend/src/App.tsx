import { useCallback, useEffect, useState } from 'react';
import { ConfidenceBanner } from './components/ConfidenceBanner';
import { Header } from './components/Header';
import { HistorySidebar } from './components/HistorySidebar';
import { ImageCropper } from './components/ImageCropper';
import { LatexEditor } from './components/LatexEditor';
import { ModelSelector } from './components/ModelSelector';
import { PreviewPane } from './components/PreviewPane';
import { SymbolPanel } from './components/SymbolPanel';
import { Toast } from './components/Toast';
import { UploadZone } from './components/UploadZone';
import { usePasteImage } from './hooks/usePasteImage';
import { ApiError, activateModel, clearHistory, createModelEvents, deleteHistory, getHistory, getModels, recognizeFormula, type ModelsEventPayload } from './services/api';
import { useAppStore } from './stores/appStore';

const FALLBACK_MODEL_ID = 'pix2text';

export default function App() {
  const [dark, setDark] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const {
    latex,
    toast,
    loading,
    preprocess,
    modelStatus,
    models,
    selectedModelId,
    history,
    confidence,
    setLatex,
    insertLatex,
    setToast,
    setLoading,
    setPreprocess,
    setModelStatus,
    setModels,
    setSelectedModelId,
    setHistory,
    setConfidence,
  } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }, [setToast]);

  const applyModelPayload = useCallback((payload: ModelsEventPayload) => {
    setModels(payload.models);
    const active = payload.models.find((model) => model.active) || payload.models.find((model) => model.id === payload.active_model_id);
    const selected = active || payload.models.find((model) => model.id === selectedModelId) || payload.models.find((model) => model.is_default) || payload.models[0];
    if (selected) {
      setSelectedModelId(selected.id);
      setModelStatus({
        status: selected.status,
        model_id: selected.id,
        active_model_id: payload.active_model_id,
        device: selected.device,
        message: selected.message,
        progress: selected.progress,
      });
    }
  }, [selectedModelId, setModelStatus, setModels, setSelectedModelId]);

  const refreshModels = useCallback(async () => {
    try {
      applyModelPayload(await getModels());
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模型列表加载失败');
    }
  }, [applyModelPayload, showToast]);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
    } catch (error) {
      showToast(error instanceof Error ? error.message : '历史记录加载失败');
    }
  }, [setHistory, showToast]);

  useEffect(() => {
    refreshModels();
    refreshHistory();
  }, [refreshModels, refreshHistory]);

  useEffect(() => {
    const source = createModelEvents();
    source.addEventListener('models', (event) => {
      try {
        applyModelPayload(JSON.parse((event as MessageEvent).data));
      } catch {
        showToast('模型状态流解析失败');
      }
    });
    source.onerror = () => {
      setModelStatus({ status: 'unavailable', device: 'cpu', message: '模型状态流已断开，正在等待重连', progress: 0 });
    };
    return () => source.close();
  }, [applyModelPayload, setModelStatus, showToast]);

  const handleSelectModel = useCallback(async (modelId: string) => {
    const target = models.find((model) => model.id === modelId);
    if (!target || target.status !== 'ready') {
      showToast(target?.message || '模型尚未就绪');
      return;
    }
    setSelectedModelId(modelId);
    setLoading(true);
    try {
      await activateModel(modelId);
      showToast(`已切换到 ${target.display_name}`);
      await refreshModels();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '模型切换失败');
    } finally {
      setLoading(false);
    }
  }, [models, refreshModels, setLoading, setSelectedModelId, showToast]);

  const runRecognition = useCallback(async (file: File, modelId: string) => {
    const result = await recognizeFormula(file, preprocess, modelId);
    setLatex(result.latex);
    setConfidence(result.confidence ?? null);
    const modelName = models.find((model) => model.id === result.model_id)?.display_name || result.model_id || modelId;
    showToast(`识别完成：${result.inference_time_ms}ms · ${modelName}`);
    await refreshHistory();
    await refreshModels();
  }, [models, preprocess, refreshHistory, refreshModels, setConfidence, setLatex, showToast]);

  const handleFile = useCallback((file: File) => {
    if (modelStatus.status === 'downloading') {
      showToast('模型正在下载或加载，请稍候');
      return;
    }
    if (modelStatus.status === 'unavailable') {
      showToast('当前模型未启用，请选择可用模型');
      return;
    }
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
  }, [modelStatus.status, showToast]);

  const handleCroppedFile = useCallback(async (file: File) => {
    setCropImageSrc(null);
    setLoading(true);
    try {
      await runRecognition(file, selectedModelId);
    } catch (error) {
      if (error instanceof ApiError && error.fallbackModelId) {
        setSelectedModelId(error.fallbackModelId);
        showToast('所选模型不可用，已回退到基础版并重试');
        try {
          await activateModel(error.fallbackModelId || FALLBACK_MODEL_ID);
          await runRecognition(file, error.fallbackModelId || FALLBACK_MODEL_ID);
        } catch (fallbackError) {
          showToast(fallbackError instanceof Error ? fallbackError.message : '基础版重试失败');
        }
      } else {
        showToast(error instanceof Error ? error.message : '识别失败');
      }
    } finally {
      setLoading(false);
    }
  }, [runRecognition, selectedModelId, setLoading, setSelectedModelId, showToast]);

  const handleCancelCrop = useCallback(() => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  }, [cropImageSrc]);

  usePasteImage(handleFile);

  async function copyLatex() {
    await navigator.clipboard.writeText(latex);
    showToast('LaTeX 已复制');
  }

  async function removeHistory(id: number) {
    try {
      await deleteHistory(id);
      await refreshHistory();
      showToast('历史记录已删除');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败');
    }
  }

  async function removeAllHistory() {
    if (history.length === 0) return;
    if (!window.confirm('确定清空全部历史记录吗？此操作不可恢复。')) return;
    try {
      const result = await clearHistory();
      await refreshHistory();
      showToast(`已清空 ${result.deleted} 条历史记录`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '清空失败');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header modelStatus={modelStatus} dark={dark} onToggleDark={() => setDark((value) => !value)} />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="mb-8 text-center">
          <p className="text-sm font-semibold text-primary">100% 本地推理 · 零外部识别 API 成本</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">本地智能数学公式识别</h1>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600 dark:text-slate-300">上传、拖拽或粘贴公式截图，按场景选择本地 OCR 模型生成 LaTeX，并实时渲染预览。</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <ModelSelector models={models} selectedModelId={selectedModelId} disabled={loading} onChange={handleSelectModel} />
            {cropImageSrc ? (
              <ImageCropper imageSrc={cropImageSrc} onConfirm={handleCroppedFile} onCancel={handleCancelCrop} />
            ) : (
              <UploadZone modelStatus={modelStatus} loading={loading} preprocess={preprocess} onTogglePreprocess={setPreprocess} onFile={handleFile} />
            )}
            <ConfidenceBanner confidence={confidence} />
            <div className="grid gap-6 lg:grid-cols-2">
              <LatexEditor value={latex} onChange={setLatex} onCopy={copyLatex} />
              <PreviewPane latex={latex} onToast={showToast} />
            </div>
            <SymbolPanel onInsert={insertLatex} />
          </div>
          <HistorySidebar history={history} onSelect={setLatex} onDelete={removeHistory} onClear={removeAllHistory} />
        </div>
      </main>
      <Toast message={toast} />
    </div>
  );
}
