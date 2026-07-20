import { useEffect } from 'react';
import { enableScreenGuard, disableScreenGuard } from '@/lib/screen-guard';
import { useDemoMode } from './useDemoMode';

/**
 * Enables screenshot/screen-recording protection while the component is mounted.
 * Automatically skips protection when demo mode is active.
 */
export function useScreenGuard() {
  const demoEnabled = useDemoMode();

  useEffect(() => {
    if (demoEnabled) {
      disableScreenGuard();
      return;
    }

    enableScreenGuard();
    return () => {
      disableScreenGuard();
    };
  }, [demoEnabled]);
}
