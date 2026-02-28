import { useEffect, useRef } from 'react';

/**
 * Re-runs the provided callback when the page becomes visible again
 * (tab switch, app resume) with a configurable throttle to avoid spam.
 */
export function useVisibilityRefresh(
  callback: () => void | Promise<void>,
  throttleMs = 30000
) {
  const lastRefreshRef = useRef(Date.now());
  const callbackRef = useRef(callback);

  // Keep callback ref updated without causing re-subscriptions
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastRefreshRef.current > throttleMs) {
          lastRefreshRef.current = now;
          callbackRef.current();
        }
      }
    };

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current > throttleMs) {
        lastRefreshRef.current = now;
        callbackRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [throttleMs]);
}

