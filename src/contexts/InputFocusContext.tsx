import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

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

  const setInputFocused = useCallback((focused: boolean) => {
    isInputFocusedRef.current = focused;
    setIsInputFocusedState(focused);
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
