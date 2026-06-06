import { useEffect } from 'react';

export function usePasteImage(onImage: (file: File) => void) {
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        onImage(new File([file], `paste-${Date.now()}.png`, { type: file.type || 'image/png' }));
      }
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onImage]);
}
