import { useState, useEffect, useCallback, useRef } from 'react';

export function useKeyboardAware() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialViewportHeight = useRef<number>(window.innerHeight);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // Store initial height
    initialViewportHeight.current = viewport.height;

    const handleResize = () => {
      // Debounce to prevent jitter during typing
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      
      debounceRef.current = setTimeout(() => {
        const heightDiff = initialViewportHeight.current - viewport.height;
        // Keyboard is considered open if viewport shrunk by more than 150px
        const open = heightDiff > 150;
        setIsKeyboardOpen(open);
        setKeyboardHeight(open ? heightDiff : 0);
      }, 100);
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const scrollInputIntoView = useCallback((inputElement: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (inputElement) {
      // Delay to allow keyboard to fully open
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
    handleInputFocus
  };
}
