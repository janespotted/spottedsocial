import React, { createContext, useContext, useCallback, useSyncExternalStore } from 'react';

// Store for managing input focus state with minimal re-renders
class InputFocusStore {
  private focused = false;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.focused;

  // For synchronous reads without subscription (used by venue arrival nudge)
  isFocused = () => this.focused;

  setFocused = (value: boolean) => {
    if (this.focused !== value) {
      this.focused = value;
      this.listeners.forEach(listener => listener());
    }
  };
}

// Singleton store instance
const inputFocusStore = new InputFocusStore();

interface InputFocusContextType {
  setInputFocused: (focused: boolean) => void;
  isInputFocused: () => boolean;
}

const InputFocusContext = createContext<InputFocusContextType>({
  setInputFocused: () => {},
  isInputFocused: () => false,
});

export function InputFocusProvider({ children }: { children: React.ReactNode }) {
  // setInputFocused is stable and doesn't cause re-renders
  const setInputFocused = useCallback((focused: boolean) => {
    inputFocusStore.setFocused(focused);
  }, []);

  // isInputFocused is a function that reads current value (no subscription)
  const isInputFocused = useCallback(() => {
    return inputFocusStore.isFocused();
  }, []);

  return (
    <InputFocusContext.Provider value={{ setInputFocused, isInputFocused }}>
      {children}
    </InputFocusContext.Provider>
  );
}

// Hook for setting focus state (used by inputs) - does NOT cause re-renders
export function useInputFocus() {
  const context = useContext(InputFocusContext);
  return context;
}

// Hook for subscribing to focus state (used only by BottomNav) - ONLY this component re-renders
export function useInputFocusState() {
  return useSyncExternalStore(
    inputFocusStore.subscribe,
    inputFocusStore.getSnapshot,
    inputFocusStore.getSnapshot
  );
}
