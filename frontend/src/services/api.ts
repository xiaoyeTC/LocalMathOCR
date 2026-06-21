export type ApiResponse<T> = { code: number; message: string; data: T };
export type ModelRuntimeState = 'downloading' | 'ready' | 'unavailable';
export type ModelStatus = {
  status: ModelRuntimeState;
  model_id?: string;
  active_model_id?: string | null;
  requested_device?: 'auto' | 'cuda' | 'cpu';
  device: 'cuda' | 'cpu';
  message: string;
  progress: number;
  cuda_available?: boolean;
  torch_version?: string | null;
  torch_cuda_version?: string | null;
  cuda_device_count?: number;
  cuda_device_name?: string | null;
};
export type OcrModelMetadata = {
  id: string;
  display_name: string;
  description: string;
  vram_requirement: string;
  strengths: string[];
  enabled: boolean;
  status: ModelRuntimeState;
  progress: number;
  device: 'cuda' | 'cpu';
  message: string;
  active: boolean;
  is_default: boolean;
};
export type ModelsEventPayload = {
  active_model_id: string | null;
  default_model_id: string;
  models: OcrModelMetadata[];
};
export type RecognizeResult = { latex: string; inference_time_ms: number; variant?: string; model_id?: string; preprocessed_image_base64?: string | null; confidence?: number };
export type HistoryItem = { id: number; latex: string; image_base64?: string | null; created_at: string };

export class ApiError extends Error {
  status: number;
  fallbackModelId?: string;

  constructor(message: string, status: number, fallbackModelId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fallbackModelId = fallbackModelId;
  }
}

const isElectron = typeof window !== 'undefined' && 'electron' in window;
const API_BASE_URL = isElectron
  ? 'http://127.0.0.1:8000/api'
  : (import.meta.env.VITE_API_BASE_URL || '/api');

const REQUEST_TIMEOUT_MS = 30_000;
const OCR_TIMEOUT_MS = 120_000;

function getSessionId(): string {
  try {
    return localStorage.getItem('localmathocr-session-id') || 'default';
  } catch {
    return 'default';
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  headers.set('X-Session-ID', getSessionId());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒），后端可能正在处理中`);
    }
    throw new Error('后端服务未连接：请确认 Backend 窗口已启动，并可访问 http://127.0.0.1:8000/health');
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message || body?.message || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, detail?.fallback_model_id);
  }
  if (!body?.data) {
    throw new Error('后端返回数据格式异常');
  }
  return (body as ApiResponse<T>).data;
}

export async function getModels(): Promise<ModelsEventPayload> {
  return request<ModelsEventPayload>('/models');
}

export function createModelEvents(): EventSource {
  return new EventSource(`${API_BASE_URL}/models/events`);
}

export async function activateModel(modelId: string): Promise<ModelStatus> {
  return request<ModelStatus>(`/models/${encodeURIComponent(modelId)}/activate`, { method: 'POST' });
}

export async function recognizeFormula(file: File, preprocess = true, modelId?: string): Promise<RecognizeResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('preprocess', String(preprocess));
  if (modelId) form.append('model_id', modelId);
  return request<RecognizeResult>('/ocr', { method: 'POST', body: form }, OCR_TIMEOUT_MS);
}

export async function getHistory(): Promise<HistoryItem[]> {
  return request<HistoryItem[]>('/history');
}

export async function clearHistory(): Promise<{ deleted: number }> {
  return request<{ deleted: number }>('/history', { method: 'DELETE' });
}

export async function deleteHistory(id: number): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/history/${id}`, { method: 'DELETE' });
}

export type ExportTextResult = { content: string; mime: string };

export async function exportFormulaText(format: string, latex: string): Promise<ExportTextResult> {
  return request<ExportTextResult>(`/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex }),
  });
}

export async function exportFormulaFile(format: string, latex: string): Promise<Blob> {
  const headers = new Headers({ 'Content-Type': 'application/json', 'X-Session-ID': getSessionId() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/export/${format}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ latex }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const detail = body?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || `Export failed: HTTP ${res.status}`;
      throw new Error(message);
    }
    return res.blob();
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('导出超时');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type ComputeResult = { result_latex: string; result_text: string; operation: string };

export async function computeFormula(latex: string, operation: string): Promise<ComputeResult> {
  return request<ComputeResult>('/compute/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex, operation }),
  });
}

export type PdfInfoResult = { total_pages: number; pdf_base64: string };

export async function getPdfInfo(file: File): Promise<PdfInfoResult> {
  const form = new FormData();
  form.append('file', file);
  return request<PdfInfoResult>('/pdf/info', { method: 'POST', body: form }, 60_000);
}

export type PdfRenderResult = { page: number; width: number; height: number; image_base64: string };

export async function renderPdfPage(pdfBase64: string, page: number, dpi: number): Promise<PdfRenderResult> {
  return request<PdfRenderResult>('/pdf/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdf_base64: pdfBase64, page, dpi }),
  }, 30_000);
}
