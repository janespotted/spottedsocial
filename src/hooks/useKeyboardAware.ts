import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Tracks keyboard open state + height.
 *
 * On native, uses the Capacitor Keyboard plugin's window events
 * (keyboardWillShow / keyboardWillHide), which fire in sync with the OS
 * keyboard animation. This is more reliable than inferring from viewport
 * size and works no matter when the component mounts.
 *
 * On web, falls back to visualViewport with a self-healing baseline.
 *
 * IMPORTANT (per CLAUDE.md): with Keyboard.resize: 'native', do NOT use
 * keyboardHeight to offset fixed-bottom elements — iOS already resizes the
 * webview. keyboardHeight is for conditional rendering/animations only.
 */
export function useKeyboardAware() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const onShow = (e: Event) => {
        const height = (e as unknown as { keyboardHeight?: number }).keyboardHeight ?? 0;
        setIsKeyboardOpen(true);
        setKeyboardHeight(height);
      };
      const onHide = () => {
        setIsKeyboardOpen(false);
        setKeyboardHeight(0);
      };
      window.addEventListener('keyboardWillShow', onShow);
      window.addEventListener('keyboardWillHide', onHide);
      return () => {
        window.removeEventListener('keyboardWillShow', onShow);
        window.removeEventListener('keyboardWillHide', onHide);
      };
    }

    // Web fallback: infer from visualViewport shrinkage. The baseline
    // self-heals (tracks the max seen height) so mounting while the
    // keyboard is open, or rotating the device, doesn't leave stale state.
    const viewport = window.visualViewport;
    if (!viewport) return;

    let baseline = Math.max(window.innerHeight, viewport.height);

    const sync = () => {
      baseline = Math.max(baseline, viewport.height);
      const diff = baseline - viewport.height;
      const open = diff > 150;
      setIsKeyboardOpen(open);
      setKeyboardHeight(open ? diff : 0);
    };

    const onOrientationChange = () => {
      // Screen dimensions changed — rebuild the baseline from scratch.
      baseline = 0;
    };

    viewport.addEventListener('resize', sync);
    window.addEventListener('orientationchange', onOrientationChange);
    return () => {
      viewport.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', onOrientationChange);
    };
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
