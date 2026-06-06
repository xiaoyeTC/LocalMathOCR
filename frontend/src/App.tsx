import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { HistorySidebar } from './components/HistorySidebar';
import { LatexEditor } from './components/LatexEditor';
import { PreviewPane } from './components/PreviewPane';
import { SymbolPanel } from './components/SymbolPanel';
import { Toast } from './components/Toast';
import { UploadZone } from './components/UploadZone';
import { useModelStatusPoll } from './hooks/useModelStatusPoll';
import { usePasteImage } from './hooks/usePasteImage';
import { clearHistory, deleteHistory, getHistory, recognizeFormula } from './services/api';
import { useAppStore } from './stores/appStore';

export default function App() {
  const [dark, setDark] = useState(false);
  const {
    latex,
    toast,
    loading,
    preprocess,
    modelStatus,
    history,
    setLatex,
    insertLatex,
    setToast,
    setLoading,
    setPreprocess,
    setHistory,
  } = useAppStore();

  useModelStatusPoll();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }, [setToast]);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
    } catch (error) {
      showToast(error instanceof Error ? error.message : '历史记录加载失败');
    }
  }, [setHistory, showToast]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleFile = useCallback(async (file: File) => {
    if (modelStatus.status !== 'ready') {
      showToast('模型尚未就绪');
      return;
    }
    setLoading(true);
    try {
      const result = await recognizeFormula(file, preprocess);
      setLatex(result.latex);
      showToast(`识别完成：${result.inference_time_ms}ms`);
      await refreshHistory();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '识别失败');
    } finally {
      setLoading(false);
    }
  }, [modelStatus.status, preprocess, refreshHistory, setLatex, setLoading, showToast]);

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
          <p className="mx-auto mt-4 max-w-2xl text-slate-600 dark:text-slate-300">上传、拖拽或粘贴公式截图，使用本地 pix2tex 模型生成 LaTeX，并实时渲染预览。</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <UploadZone modelStatus={modelStatus} loading={loading} preprocess={preprocess} onTogglePreprocess={setPreprocess} onFile={handleFile} />
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
