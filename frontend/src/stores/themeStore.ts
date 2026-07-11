import { create } from 'zustand';

export type ThemeMode = 'classic' | 'modern';

export type ColorScheme = {
  name: string;
  primary: string;
  hover: string;
  light: string;
  dark: string;
};

export const COLOR_SCHEMES: ColorScheme[] = [
  { name: '蓝色', primary: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE', dark: '#1E40AF' },
  { name: '靛蓝', primary: '#4F46E5', hover: '#4338CA', light: '#E0E7FF', dark: '#3730A3' },
  { name: '紫色', primary: '#9333EA', hover: '#7E22CE', light: '#F3E8FF', dark: '#6B21A8' },
  { name: '玫瑰', primary: '#E11D48', hover: '#BE123C', light: '#FFE4E6', dark: '#9F1239' },
  { name: '琥珀', primary: '#D97706', hover: '#B45309', light: '#FEF3C7', dark: '#92400E' },
  { name: '翡翠', primary: '#059669', hover: '#047857', light: '#D1FAE5', dark: '#065F46' },
  { name: '青色', primary: '#0891B2', hover: '#0E7490', light: '#CFFAFE', dark: '#155E75' },
  { name: '石墨', primary: '#52525B', hover: '#3F3F46', light: '#F4F4F5', dark: '#27272A' },
];

type ThemeState = {
  mode: ThemeMode;
  colorIndex: number;
  dark: boolean;
  setMode: (mode: ThemeMode) => void;
  setColorIndex: (index: number) => void;
  toggleDark: () => void;
};

function applyColorScheme(scheme: ColorScheme) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', scheme.primary);
  root.style.setProperty('--color-primary-hover', scheme.hover);
  root.style.setProperty('--color-primary-light', scheme.light);
  root.style.setProperty('--color-primary-dark', scheme.dark);
}

const STORAGE_KEY = 'localmathocr-theme';

function loadSaved(): { mode: ThemeMode; colorIndex: number; dark: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { mode: 'classic', colorIndex: 0, dark: false };
}

const saved = loadSaved();

export const useThemeStore = create<ThemeState>((set) => {
  setTimeout(() => {
    applyColorScheme(COLOR_SCHEMES[saved.colorIndex]);
    document.documentElement.classList.toggle('dark', saved.dark);
  }, 0);
  return {
    mode: saved.mode,
    colorIndex: saved.colorIndex,
    dark: saved.dark,
    setMode: (mode) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, colorIndex: useThemeStore.getState().colorIndex, dark: useThemeStore.getState().dark }));
      set({ mode });
    },
    setColorIndex: (colorIndex) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: useThemeStore.getState().mode, colorIndex, dark: useThemeStore.getState().dark }));
      applyColorScheme(COLOR_SCHEMES[colorIndex]);
      set({ colorIndex });
    },
    toggleDark: () => {
      const next = !useThemeStore.getState().dark;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: useThemeStore.getState().mode, colorIndex: useThemeStore.getState().colorIndex, dark: next }));
      document.documentElement.classList.toggle('dark', next);
      set({ dark: next });
    },
  };
});
