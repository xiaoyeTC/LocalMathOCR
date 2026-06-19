import { useRef, useState, useCallback, useEffect } from 'react';
import { recognizeFormula } from '../services/api';

type Props = {
  onResult: (latex: string) => void;
  onToast: (message: string) => void;
  onRecognized?: () => void;
};

type Point = { x: number; y: number };
type Stroke = { points: Point[]; width: number; tool: 'pen' | 'eraser' };

const COLORS = { pen: '#1e293b', eraser: '#ffffff' };

export function HandwritingPad({ onResult, onToast, onRecognized }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [lineWidth, setLineWidth] = useState(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [recognizing, setRecognizing] = useState(false);

  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const toolRef = useRef(tool);
  const lineWidthRef = useRef(lineWidth);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    const step = 20;
    for (let x = step; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = step; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, []);

  function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (stroke.points.length < 2) return;
    ctx.strokeStyle = stroke.tool === 'eraser' ? COLORS.eraser : COLORS.pen;
    ctx.lineWidth = stroke.tool === 'eraser' ? stroke.width * 3 : stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];
      const mx = (prev.x + curr.x) / 2;
      const my = (prev.y + curr.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    ctx.stroke();
  }

  useEffect(() => { redraw(); }, [redraw, strokes]);

  function getPos(e: MouseEvent | TouchEvent): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleStart(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      drawingRef.current = true;
      currentStrokeRef.current = [getPos(e)];
    }

    function handleMove(e: MouseEvent | TouchEvent) {
      if (!drawingRef.current) return;
      e.preventDefault();
      const pt = getPos(e);
      const prev = currentStrokeRef.current;
      if (prev.length > 0) {
        const ctx = canvas!.getContext('2d')!;
        const last = prev[prev.length - 1];
        const lw = lineWidthRef.current;
        const tl = toolRef.current;
        ctx.strokeStyle = tl === 'eraser' ? COLORS.eraser : COLORS.pen;
        ctx.lineWidth = tl === 'eraser' ? lw * 3 : lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const mx = (last.x + pt.x) / 2;
        const my = (last.y + pt.y) / 2;
        ctx.quadraticCurveTo(last.x, last.y, mx, my);
        ctx.stroke();
      }
      currentStrokeRef.current = [...prev, pt];
    }

    function handleEnd(e: MouseEvent | TouchEvent) {
      if (!drawingRef.current) return;
      e.preventDefault();
      drawingRef.current = false;
      const pts = currentStrokeRef.current;
      if (pts.length > 1) {
        const newStroke: Stroke = { points: pts, width: lineWidthRef.current, tool: toolRef.current };
        setStrokes((prev) => [...prev, newStroke]);
      }
      currentStrokeRef.current = [];
    }

    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('mouseleave', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleStart);
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseup', handleEnd);
      canvas.removeEventListener('mouseleave', handleEnd);
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      canvas.removeEventListener('touchend', handleEnd);
      canvas.removeEventListener('touchcancel', handleEnd);
    };
  }, []);

  function handleUndo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setStrokes([]);
  }

  async function handleRecognize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (strokes.length === 0) { onToast('请先手写公式'); return; }

    setRecognizing(true);
    try {
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      const file = new File([blob], 'handwriting.png', { type: 'image/png' });
      const result = await recognizeFormula(file, true);
      onResult(result.latex);
      const ms = result.inference_time_ms || 0;
      onToast(`识别完成：${ms}ms · ${result.model_id || 'OCR'}`);
      if (onRecognized) onRecognized();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '识别失败');
    } finally {
      setRecognizing(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700">
          <button onClick={() => setTool('pen')} className={`px-2 py-1 text-xs font-medium transition-colors sm:px-2.5 ${tool === 'pen' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            ✏️ 画笔
          </button>
          <button onClick={() => setTool('eraser')} className={`px-2 py-1 text-xs font-medium transition-colors sm:px-2.5 ${tool === 'eraser' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            🧹 橡皮
          </button>
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          <span className="hidden sm:inline">粗细</span>
          <input type="range" min={1} max={8} value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-16 accent-blue-600 sm:w-20" />
          <span className="w-3 text-right">{lineWidth}</span>
        </label>
        <button onClick={handleUndo} disabled={strokes.length === 0} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 sm:px-2.5">撤销</button>
        <button onClick={handleClear} disabled={strokes.length === 0} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 sm:px-2.5">清空</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          className="w-full cursor-crosshair touch-none bg-white"
          style={{ aspectRatio: '8/5', minHeight: '200px' }}
        />
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={handleRecognize}
          disabled={recognizing || strokes.length === 0}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {recognizing ? '识别中...' : '识别公式'}
        </button>
      </div>
    </div>
  );
}
