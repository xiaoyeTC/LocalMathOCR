import { useEffect } from 'react';
import { getModelStatus } from '../services/api';
import { useAppStore } from '../stores/appStore';

export function useModelStatusPoll(intervalMs = 2000) {
  const setModelStatus = useAppStore((state) => state.setModelStatus);
  const selectedModelId = useAppStore((state) => state.selectedModelId);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const status = await getModelStatus(selectedModelId);
        if (active) setModelStatus(status);
      } catch (error) {
        if (active) {
          setModelStatus({ status: 'unavailable', device: 'cpu', message: error instanceof Error ? error.message : '模型服务不可用', progress: 0 });
        }
      }
    }
    poll();
    const timer = window.setInterval(poll, intervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, selectedModelId, setModelStatus]);
}
