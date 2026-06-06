export type ApiResponse<T> = { code: number; message: string; data: T };
export type ModelStatus = {
  status: 'loading' | 'ready' | 'error';
  requested_device?: 'auto' | 'cuda' | 'cpu';
  device: 'cuda' | 'cpu';
  message: string;
  cuda_available?: boolean;
  torch_version?: string | null;
  torch_cuda_version?: string | null;
  cuda_device_count?: number;
  cuda_device_name?: string | null;
};
export type RecognizeResult = { latex: string; inference_time_ms: number; variant?: string; preprocessed_image_base64?: string | null };
export type HistoryItem = { id: number; latex: string; image_base64?: string | null; created_at: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new Error('后端服务未连接：请确认 Backend 窗口已启动，并可访问 http://127.0.0.1:8000/health');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail || body?.message || `HTTP ${res.status}`);
  }
  return (body as ApiResponse<T>).data;
}

export async function getModelStatus(): Promise<ModelStatus> {
  return request<ModelStatus>('/model-status');
}

export async function recognizeFormula(file: File, preprocess = true): Promise<RecognizeResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('preprocess', String(preprocess));
  return request<RecognizeResult>('/recognize', { method: 'POST', body: form });
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
