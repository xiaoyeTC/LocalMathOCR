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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function getSessionId(): string {
  try {
    return localStorage.getItem('localmathocr-session-id') || 'default';
  } catch {
    return 'default';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  headers.set('X-Session-ID', getSessionId());
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error('后端服务未连接：请确认 Backend 窗口已启动，并可访问 http://127.0.0.1:8000/health');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message || body?.message || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, detail?.fallback_model_id);
  }
  return (body as ApiResponse<T>).data;
}

export async function getModelStatus(modelId?: string): Promise<ModelStatus> {
  const query = modelId ? `?model_id=${encodeURIComponent(modelId)}` : '';
  return request<ModelStatus>(`/model-status${query}`);
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
  return request<RecognizeResult>('/ocr', { method: 'POST', body: form });
}

export async function getHistory(): Promise<HistoryItem[]> {
  return request<HistoryItem[]>('/history');
}

export async function createHistory(latex: string, imageBase64?: string | null): Promise<HistoryItem> {
  return request<HistoryItem>('/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex, image_base64: imageBase64 }),
  });
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
  const res = await fetch(`${API_BASE_URL}/export/${format}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ latex }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail : detail?.message || `Export failed: HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.blob();
}
