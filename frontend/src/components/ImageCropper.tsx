import { useCallback, useRef, useState, useEffect } from 'react';
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

const MAGNIFIER_SIZE = 120;
const MAGNIFIER_ZOOM = 2;
const MAGNIFIER_OFFSET = 80;

function MagnifierOverlay({
  imageSrc,
  containerRef,
  touchPos,
  visible,
}: {
  imageSrc: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  touchPos: { x: number; y: number };
  visible: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (!imgRef.current) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageSrc;
      imgRef.current = img;
    }
    const img = imgRef.current;
    if (!img.complete) {
      img.onload = () => drawMagnifier();
    } else {
      drawMagnifier();
    }
  }, [visible, touchPos.x, touchPos.y, imageSrc]);

  function drawMagnifier() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const relX = touchPos.x - rect.left;
    const relY = touchPos.y - rect.top;

    const imgEl = container.querySelector('img') as HTMLImageElement | null;
    if (!imgEl) return;
    const imgRect = imgEl.getBoundingClientRect();
    const imgRelX = touchPos.x - imgRect.left;
    const imgRelY = touchPos.y - imgRect.top;

    const normX = imgRelX / imgRect.width;
    const normY = imgRelY / imgRect.height;

    const srcX = normX * img.naturalWidth;
    const srcY = normY * img.naturalHeight;
    const srcSize = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;

    canvas.width = MAGNIFIER_SIZE;
    canvas.height = MAGNIFIER_SIZE;
    ctx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);

    ctx.beginPath();
    ctx.arc(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      srcX - srcSize / 2,
      srcY - srcSize / 2,
      srcSize,
      srcSize,
      0,
      0,
      MAGNIFIER_SIZE,
      MAGNIFIER_SIZE,
    );

    ctx.beginPath();
    ctx.arc(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(MAGNIFIER_SIZE / 2 - 6, MAGNIFIER_SIZE / 2);
    ctx.lineTo(MAGNIFIER_SIZE / 2 + 6, MAGNIFIER_SIZE / 2);
    ctx.moveTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2 - 6);
    ctx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE / 2 + 6);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (!visible) return null;

  const container = containerRef.current;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const x = touchPos.x - rect.left;
  const y = touchPos.y - rect.top;

  let magX = x - MAGNIFIER_SIZE / 2;
  let magY = y - MAGNIFIER_SIZE - MAGNIFIER_OFFSET;

  if (magY < 0) magY = y + MAGNIFIER_OFFSET;
  if (magX < 0) magX = 0;
  if (magX + MAGNIFIER_SIZE > rect.width) magX = rect.width - MAGNIFIER_SIZE;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute z-50 rounded-full shadow-lg"
      style={{
        width: MAGNIFIER_SIZE,
        height: MAGNIFIER_SIZE,
        left: magX,
        top: magY,
      }}
    />
  );
}

export function ImageCropper({ imageSrc, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;
    const touch = e.touches[0];
    setTouchPos({ x: touch.clientX, y: touch.clientY });
    setShowMagnifier(true);
  }, [isTouchDevice]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;
    const touch = e.touches[0];
    setTouchPos({ x: touch.clientX, y: touch.clientY });
  }, [isTouchDevice]);

  const handleTouchEnd = useCallback(() => {
    setShowMagnifier(false);
  }, []);

  return (
    <section className="rounded-3xl border border-blue-300 bg-white p-4 shadow-sm dark:border-blue-900 dark:bg-slate-900 sm:p-6">
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">框选公式区域</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing || !completedCrop}
            className="flex-1 rounded-xl bg-primary px-4 py-2 font-medium text-white shadow disabled:cursor-not-allowed disabled:bg-slate-400 sm:flex-none sm:px-5"
          >
            {processing ? '处理中...' : '确认框选'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 sm:flex-none sm:px-5"
          >
            取消
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative flex justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
        <MagnifierOverlay
          imageSrc={imageSrc}
          containerRef={containerRef}
          touchPos={touchPos}
          visible={showMagnifier && isTouchDevice}
        />
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
          请框选纯公式区域
        </div>
      </div>
    </section>
  );
}
