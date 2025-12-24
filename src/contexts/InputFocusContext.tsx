import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

interface InputFocusContextType {
  isInputFocused: boolean;
  setInputFocused: (focused: boolean) => void;
  isInputFocusedRef: React.MutableRefObject<boolean>;
}

const InputFocusContext = createContext<InputFocusContextType>({
  isInputFocused: false,
  setInputFocused: () => {},
  isInputFocusedRef: { current: false },
});

export function InputFocusProvider({ children }: { children: React.ReactNode }) {
  const [isInputFocused, setIsInputFocusedState] = useState(false);
  const isInputFocusedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setInputFocused = useCallback((focused: boolean) => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    isInputFocusedRef.current = focused;
    setIsInputFocusedState(focused);

    // If focusing, set a safety timeout to auto-reset after 30 seconds
    // This prevents the nav from being permanently hidden if blur doesn't fire
    if (focused) {
      timeoutRef.current = setTimeout(() => {
        isInputFocusedRef.current = false;
        setIsInputFocusedState(false);
      }, 30000);
    }
  }, []);

  // Safety net: Listen for visibility changes to reset focus state
  // When user switches apps or tabs, the keyboard closes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isInputFocusedRef.current) {
        isInputFocusedRef.current = false;
        setIsInputFocusedState(false);
      }
    };

    // Reset focus when window loses focus (mobile app switching)
    const handleWindowBlur = () => {
      if (isInputFocusedRef.current) {
        // Small delay to allow for normal focus transitions
        setTimeout(() => {
          const activeElement = document.activeElement;
          const isInputActive = activeElement?.tagName === 'INPUT' || 
                               activeElement?.tagName === 'TEXTAREA' ||
                               activeElement?.getAttribute('contenteditable') === 'true';
          
          if (!isInputActive && isInputFocusedRef.current) {
            isInputFocusedRef.current = false;
            setIsInputFocusedState(false);
          }
        }, 300);
      }
    };

    // Periodic check to ensure state is synced with actual focus
    const checkFocusState = () => {
      const activeElement = document.activeElement;
      const isInputActive = activeElement?.tagName === 'INPUT' || 
                           activeElement?.tagName === 'TEXTAREA' ||
                           activeElement?.getAttribute('contenteditable') === 'true';
      
      if (!isInputActive && isInputFocusedRef.current) {
        isInputFocusedRef.current = false;
        setIsInputFocusedState(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    
    // Check every 2 seconds as a fallback
    const intervalId = setInterval(checkFocusState, 2000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      clearInterval(intervalId);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <InputFocusContext.Provider value={{ isInputFocused, setInputFocused, isInputFocusedRef }}>
      {children}
    </InputFocusContext.Provider>
  );
}

export function useInputFocus() {
  return useContext(InputFocusContext);
}
