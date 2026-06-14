import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ModelStatus } from '../services/api';

type Props = {
  modelStatus: ModelStatus;
  loading: boolean;
  onFile: (file: File) => void;
};

export function UploadZone({ modelStatus, loading, onFile }: Props) {
  const disabled = modelStatus.status === 'downloading' || modelStatus.status === 'unavailable' || loading;
  const requested = modelStatus.requested_device?.toUpperCase();
  const actual = modelStatus.device.toUpperCase();
  const deviceLabel = requested && requested !== actual ? `${requested} → ${actual}` : actual;
  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (file) onFile(file);
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    noClick: true,
    disabled,
  });

  return (
    <section id="recognize" className="rounded-3xl border border-dashed border-blue-300 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900 sm:p-8">
      <div {...getRootProps()} className={`flex flex-col items-center justify-center rounded-2xl px-3 py-6 text-center transition sm:px-4 sm:py-10 ${isDragActive ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-slate-50 dark:bg-slate-950'}`}>
        <input {...getInputProps()} />
        <div className="mb-3 text-4xl sm:mb-4 sm:text-5xl">📷</div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white sm:text-xl">拖拽图片到此处，或点击上传 / Ctrl+V 粘贴</h2>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">支持 JPG / PNG / WebP，最大 10MB。所选模型会在本地按需加载并完成识别。</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3">
          <button type="button" onClick={open} disabled={disabled} className="rounded-xl bg-primary px-5 py-2.5 font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400">
            {loading ? '识别中...' : '选择文件'}
          </button>
          <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">设备：{deviceLabel}</span>
        </div>
        {modelStatus.status === 'downloading' && <p className="mt-4 text-sm text-amber-600 dark:text-amber-300">{modelStatus.message} · {modelStatus.progress}%</p>}
        {modelStatus.status === 'unavailable' && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{modelStatus.message}</p>}
      </div>
    </section>
  );
}
