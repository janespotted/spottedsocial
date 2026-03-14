import { useState, useEffect, useCallback } from 'react';

export function useKeyboardAware() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const fullHeight = window.innerHeight;

    const sync = () => {
      const diff = fullHeight - viewport.height;
      const open = diff > 150;
      setIsKeyboardOpen(open);
      setKeyboardHeight(open ? diff : 0);
    };

    viewport.addEventListener('resize', sync);
    return () => viewport.removeEventListener('resize', sync);
  }, []);

  const scrollInputIntoView = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      }
    },
    []
  );

  const handleInputFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      scrollInputIntoView(e.target);
    },
    [scrollInputIntoView]
  );

  return { isKeyboardOpen, keyboardHeight, scrollInputIntoView, handleInputFocus };
}
