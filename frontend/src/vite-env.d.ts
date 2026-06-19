/// <reference types="vite/client" />

interface Window {
  electron?: {
    platform: string;
    isElectron: boolean;
  };
}
