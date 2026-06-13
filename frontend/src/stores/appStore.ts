import { create } from 'zustand';
import type { HistoryItem, ModelStatus, OcrModelMetadata } from '../services/api';

type AppState = {
  latex: string;
  toast: string;
  loading: boolean;
  preprocess: boolean;
  modelStatus: ModelStatus;
  models: OcrModelMetadata[];
  selectedModelId: string;
  history: HistoryItem[];
  confidence: number | null;
  setLatex: (latex: string) => void;
  insertLatex: (snippet: string) => void;
  setToast: (toast: string) => void;
  setLoading: (loading: boolean) => void;
  setPreprocess: (preprocess: boolean) => void;
  setModelStatus: (status: ModelStatus) => void;
  setModels: (models: OcrModelMetadata[]) => void;
  setSelectedModelId: (modelId: string) => void;
  setHistory: (history: HistoryItem[]) => void;
  setConfidence: (confidence: number | null) => void;
};

const initialLatex = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

export const useAppStore = create<AppState>((set) => ({
  latex: initialLatex,
  toast: '',
  loading: false,
  preprocess: false,
  modelStatus: { status: 'downloading', device: 'cpu', message: '正在连接本地模型服务', progress: 0 },
  models: [],
  selectedModelId: 'pix2tex',
  history: [],
  confidence: null,
  setLatex: (latex) => set({ latex }),
  insertLatex: (snippet) => set((state) => ({ latex: `${state.latex}${snippet}` })),
  setToast: (toast) => set({ toast }),
  setLoading: (loading) => set({ loading }),
  setPreprocess: (preprocess) => set({ preprocess }),
  setModelStatus: (modelStatus) => set({ modelStatus }),
  setModels: (models) => set({ models }),
  setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
  setHistory: (history) => set({ history }),
  setConfidence: (confidence) => set({ confidence }),
}));
