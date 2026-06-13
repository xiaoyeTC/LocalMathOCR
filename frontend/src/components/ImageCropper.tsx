import { useCallback, useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

type Props = {
  imageSrc: string;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

function fullImageCrop(): Crop {
  return { unit: '%', x: 0, y: 0, width: 100, height: 100 };
}

function getCroppedBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width * scaleX,
    crop.height * scaleY,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas export failed'));
    }, 'image/png');
  });
}

export function ImageCropper({ imageSrc, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);

  const onImageLoad = useCallback(() => {
    setCrop(fullImageCrop());
  }, []);

  const handleConfirm = useCallback(async () => {
    const image = imgRef.current;
    if (!image || !completedCrop) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(image, completedCrop);
      const file = new File([blob], 'cropped.png', { type: 'image/png' });
      onConfirm(file);
    } catch {
      onCancel();
    } finally {
      setProcessing(false);
    }
  }, [completedCrop, onConfirm, onCancel]);

  return (
    <section className="rounded-3xl border border-blue-300 bg-white p-6 shadow-sm dark:border-blue-900 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">框选公式区域</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing || !completedCrop}
            className="rounded-xl bg-primary px-5 py-2 font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {processing ? '处理中...' : '确认框选'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-5 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            取消
          </button>
        </div>
      </div>
      <div className="relative flex justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c as PixelCrop)}
          className="max-h-[500px]"
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="待裁剪图片"
            onLoad={onImageLoad}
            className="max-h-[500px] object-contain"
          />
        </ReactCrop>
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
          请框选纯公式区域
        </div>
      </div>
    </section>
  );
}
