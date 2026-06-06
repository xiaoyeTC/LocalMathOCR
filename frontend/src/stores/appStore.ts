import { create } from 'zustand';
import type { HistoryItem, ModelStatus } from '../services/api';

type AppState = {
  latex: string;
  toast: string;
  loading: boolean;
  preprocess: boolean;
  modelStatus: ModelStatus;
  history: HistoryItem[];
  setLatex: (latex: string) => void;
  insertLatex: (snippet: string) => void;
  setToast: (toast: string) => void;
  setLoading: (loading: boolean) => void;
  setPreprocess: (preprocess: boolean) => void;
  setModelStatus: (status: ModelStatus) => void;
  setHistory: (history: HistoryItem[]) => void;
};

const initialLatex = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

export const useAppStore = create<AppState>((set) => ({
  latex: initialLatex,
  toast: '',
  loading: false,
  preprocess: false,
  modelStatus: { status: 'loading', device: 'cpu', message: '正在连接本地模型服务' },
  history: [],
  setLatex: (latex) => set({ latex }),
  insertLatex: (snippet) => set((state) => ({ latex: `${state.latex}${snippet}` })),
  setToast: (toast) => set({ toast }),
  setLoading: (loading) => set({ loading }),
  setPreprocess: (preprocess) => set({ preprocess }),
  setModelStatus: (modelStatus) => set({ modelStatus }),
  setHistory: (history) => set({ history }),
}));
