import { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ModelStatus } from '../services/api';
import { recognizeFormula } from '../services/api';

type Props = {
  modelStatus: ModelStatus;
  loading: boolean;
  onFile: (file: File) => void;
  onInsertLatex: (latex: string) => void;
  onToast: (message: string) => void;
  onRecognized?: () => void;
};

type UploadMode = 'image' | 'pdf';

type Rect = { x: number; y: number; w: number; h: number };
type RecognitionResult = { latex: string; page: number; rect: Rect };

export function UploadZone({ modelStatus, loading, onFile, onInsertLatex, onToast, onRecognized }: Props) {
  const [mode, setMode] = useState<UploadMode>('image');

  const imageDisabled = modelStatus.status === 'downloading' || modelStatus.status === 'unavailable' || loading;
  const requested = modelStatus.requested_device?.toUpperCase();
  const actual = modelStatus.device.toUpperCase();
  const deviceLabel = requested && requested !== actual ? `${requested} → ${actual}` : actual;

  const onImageDrop = useCallback((files: File[]) => {
    if (files[0]) onFile(files[0]);
  }, [onFile]);

  const imageDropzone = useDropzone({
    onDrop: onImageDrop,
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    noClick: true,
    disabled: imageDisabled || mode !== 'image',
  });

  return (
    <section id="recognize" className="rounded-3xl border border-dashed border-blue-300 bg-white shadow-sm dark:border-blue-900 dark:bg-slate-900">
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setMode('image')} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${mode === 'image' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>图片识别</button>
        <button onClick={() => setMode('pdf')} className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${mode === 'pdf' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}>PDF 公式提取</button>
      </div>

      {mode === 'image' && (
        <div className="p-4 sm:p-8">
          <div {...imageDropzone.getRootProps()} className={`flex flex-col items-center justify-center rounded-2xl px-3 py-6 text-center transition sm:px-4 sm:py-10 ${imageDropzone.isDragActive ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-50 dark:bg-slate-950'}`}>
            <input {...imageDropzone.getInputProps()} />
            <div className="mb-3 text-4xl sm:mb-4 sm:text-5xl">📷</div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">拖拽图片到此处，或点击上传 / Ctrl+V 粘贴</h2>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">支持 JPG / PNG / WebP，最大 10MB</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3">
              <button type="button" onClick={imageDropzone.open} disabled={imageDisabled} className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400">{loading ? '识别中...' : '选择文件'}</button>
              <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">设备：{deviceLabel}</span>
            </div>
            {modelStatus.status === 'downloading' && <p className="mt-4 text-sm text-amber-600 dark:text-amber-300">{modelStatus.message} · {modelStatus.progress}%</p>}
            {modelStatus.status === 'unavailable' && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{modelStatus.message}</p>}
          </div>
        </div>
      )}

      {mode === 'pdf' && (
        <PdfExtractor onInsert={onInsertLatex} onToast={onToast} onRecognized={onRecognized} />
      )}
    </section>
  );
}

function PdfExtractor({ onInsert, onToast, onRecognized }: { onInsert: (l: string) => void; onToast: (m: string) => void; onRecognized?: () => void }) {
  const [pdfBase64, setPdfBase64] = useState('');
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImage, setPageImage] = useState('');
  const [pageNaturalSize, setPageNaturalSize] = useState({ w: 0, h: 0 });
  const [displayedSize, setDisplayedSize] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [zoom, setZoom] = useState(1);

  const imgRef = useRef<HTMLImageElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/pdf/info', { method: 'POST', body: form });
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '上传失败');
      setPdfBase64(data.data.pdf_base64);
      setTotalPages(data.data.total_pages);
      setCurrentPage(1);
      setResults([]);
      setZoom(1);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'PDF 上传失败');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  const pdfDropzone = useDropzone({
    onDrop: useCallback((files: File[]) => { if (files[0]) handleUpload(files[0]); }, [handleUpload]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: loading,
  });

  const renderPage = useCallback(async (page: number) => {
    if (!pdfBase64) return;
    setRendering(true);
    try {
      const res = await fetch('/api/pdf/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_base64: pdfBase64, page, dpi: 200 }),
      });
      const data = await res.json();
      if (data.code !== 200) throw new Error(data.message || '渲染失败');
      setPageImage(data.data.image_base64);
      setPageNaturalSize({ w: data.data.width, h: data.data.height });
    } catch (err) {
      onToast(err instanceof Error ? err.message : '渲染失败');
    } finally {
      setRendering(false);
    }
  }, [pdfBase64, onToast]);

  useEffect(() => {
    if (pdfBase64) renderPage(currentPage);
  }, [pdfBase64, currentPage, renderPage]);

  function handleMouseDown(e: React.MouseEvent) {
    if (!selecting || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scale = pageNaturalSize.w / rect.width;
    setDragStart({ x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale });
    setDragRect(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragStart || !selecting || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scale = pageNaturalSize.w / rect.width;
    const rawX = (e.clientX - rect.left) * scale;
    const rawY = (e.clientY - rect.top) * scale;
    const x = Math.max(0, Math.min(rawX, pageNaturalSize.w));
    const y = Math.max(0, Math.min(rawY, pageNaturalSize.h));
    setDragRect({ x: Math.min(dragStart.x, x), y: Math.min(dragStart.y, y), w: Math.abs(x - dragStart.x), h: Math.abs(y - dragStart.y) });
  }

  async function handleMouseUp() {
    if (!dragRect || !selecting || dragRect.w < 5 || dragRect.h < 5) { setDragStart(null); setDragRect(null); return; }
    setDragStart(null);
    setSelecting(false);
    setRecognizing(true);
    try {
      const img = imgRef.current!;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(dragRect.w); canvas.height = Math.round(dragRect.h);
      canvas.getContext('2d')!.drawImage(img, Math.round(dragRect.x), Math.round(dragRect.y), Math.round(dragRect.w), Math.round(dragRect.h), 0, 0, Math.round(dragRect.w), Math.round(dragRect.h));
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const result = await recognizeFormula(new File([blob], 'crop.png', { type: 'image/png' }), true);
      setResults((prev) => [{ latex: result.latex, page: currentPage, rect: dragRect }, ...prev]);
      const modelName = result.model_id || 'OCR';
      const ms = result.inference_time_ms || 0;
      onToast(`识别完成：${ms}ms · ${modelName}`);
      if (onRecognized) onRecognized();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '识别失败');
    } finally {
      setRecognizing(false);
      setDragRect(null);
    }
  }

  const isDragActive = pdfDropzone.isDragActive;

  if (!pdfBase64) {
    return (
      <div
        {...pdfDropzone.getRootProps()}
        className={`flex flex-col items-center justify-center p-8 transition ${isDragActive ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}
      >
        <input {...pdfDropzone.getInputProps()} />
        <label className="cursor-pointer rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white shadow hover:bg-blue-700" onClick={(e) => e.preventDefault()}>
          {loading ? '上传中...' : '选择 PDF 文件'}
          <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </label>
        <p className="mt-2 text-xs text-slate-400">{isDragActive ? '释放文件开始上传' : '拖拽 PDF 到此处，或点击选择文件'}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">◀</button>
        <span className="text-xs text-slate-600 dark:text-slate-300">{currentPage} / {totalPages}</span>
        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">▶</button>
        <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
        <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">−</button>
        <span className="w-10 text-center text-xs text-slate-600 dark:text-slate-300">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">+</button>
        <button onClick={() => setZoom(1)} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">重置</button>
        <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
        <button onClick={() => setSelecting(!selecting)} className={`rounded-lg px-3 py-1 text-xs font-medium ${selecting ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300'}`}>{selecting ? '取消框选' : '框选公式'}</button>
        <button onClick={() => { onInsert(results.map((r) => r.latex).join('\n')); onToast('已插入所有'); }} disabled={results.length === 0} className="ml-auto rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">全部插入</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" style={{ maxHeight: '500px' }}>
          {rendering && <div className="flex items-center justify-center p-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>}
          <div
            className="relative inline-block"
            style={{ cursor: selecting ? 'crosshair' : 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {pageImage && (
              <img
                ref={imgRef}
                src={pageImage}
                alt={`Page ${currentPage}`}
                className="block max-w-full"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setDisplayedSize({ w: el.clientWidth, h: el.clientHeight });
                }}
                draggable={false}
              />
            )}
            {dragRect && (() => {
              const sx = displayedSize.w / pageNaturalSize.w;
              const sy = displayedSize.h / pageNaturalSize.h;
              return <div className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none" style={{ left: dragRect.x * sx * zoom, top: dragRect.y * sy * zoom, width: dragRect.w * sx * zoom, height: dragRect.h * sy * zoom, zIndex: 10 }} />;
            })()}
            {results.filter((r) => r.page === currentPage).map((r, i) => {
              const sx = displayedSize.w / pageNaturalSize.w;
              const sy = displayedSize.h / pageNaturalSize.h;
              return <div key={i} className="absolute border border-green-500 bg-green-500/10 pointer-events-none" style={{ left: r.rect.x * sx * zoom, top: r.rect.y * sy * zoom, width: r.rect.w * sx * zoom, height: r.rect.h * sy * zoom, zIndex: 10 }} title={r.latex} />;
            })}
          </div>
        </div>

        <div className="flex flex-col">
          <span className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">识别结果（{results.length}）</span>
          {recognizing && <div className="mb-2 flex items-center gap-2 rounded-xl bg-blue-50 p-2 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />识别中...</div>}
          <div className="max-h-[440px] space-y-2 overflow-y-auto">
            {results.length === 0 && !recognizing && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-slate-700">点击「框选公式」后在页面上拖拽</div>}
            {results.map((r, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">P{r.page}</span>
                </div>
                <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-200">{r.latex || '(空)'}</p>
                <div className="mt-1.5 flex gap-1">
                  <button onClick={() => { onInsert(r.latex); onToast('已插入'); }} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700">插入</button>
                  <button onClick={() => { navigator.clipboard.writeText(r.latex); onToast('已复制'); }} className="rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300">复制</button>
                  <button onClick={() => setResults((prev) => prev.filter((_, j) => j !== i))} className="rounded bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300">删除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
