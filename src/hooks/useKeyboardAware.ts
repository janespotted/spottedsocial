import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

export function useKeyboardAware() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialViewportHeight = useRef<number>(window.innerHeight);

  useEffect(() => {
    // Native: use Capacitor Keyboard plugin for accurate height + events
    if (Capacitor.isNativePlatform()) {
      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        const height = info.keyboardHeight;
        setKeyboardHeight(height);
        setIsKeyboardOpen(true);
        document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
      });

      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardHeight(0);
        setIsKeyboardOpen(false);
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });

      return () => {
        showListener.then(h => h.remove());
        hideListener.then(h => h.remove());
      };
    }

    // Web fallback: use visualViewport
    const viewport = window.visualViewport;
    if (!viewport) return;

    initialViewportHeight.current = viewport.height;
    let debounceTimer: NodeJS.Timeout | null = null;

    const handleResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const heightDiff = initialViewportHeight.current - viewport.height;
        const open = heightDiff > 150;
        setIsKeyboardOpen(open);
        setKeyboardHeight(open ? heightDiff : 0);
        document.documentElement.style.setProperty('--keyboard-height', open ? `${heightDiff}px` : '0px');
      }, 100);
    };

    viewport.addEventListener('resize', handleResize);
    return () => {
      viewport.removeEventListener('resize', handleResize);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  const scrollInputIntoView = useCallback((inputElement: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (inputElement) {
      setTimeout(() => {
        inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    scrollInputIntoView(e.target);
  }, [scrollInputIntoView]);

  return {
    isKeyboardOpen,
    keyboardHeight,
    scrollInputIntoView,
    handleInputFocus,
  };
}
