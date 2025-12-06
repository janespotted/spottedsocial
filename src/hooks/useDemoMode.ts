import { useState, useEffect } from 'react';
import { getDemoMode } from '@/lib/demo-data';

export function useDemoMode() {
  // Synchronously initialize from localStorage to avoid first-render race condition
  const [demoEnabled, setDemoEnabled] = useState(() => {
    try {
      return getDemoMode().enabled;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkDemoMode = () => {
      const mode = getDemoMode();
      setDemoEnabled(mode.enabled);
    };
    
    // Listen for storage changes (when demo mode is toggled in another tab/component)
    window.addEventListener('storage', checkDemoMode);
    
    // Also listen for custom event (when demo mode is toggled in same tab)
    window.addEventListener('demoModeChanged', checkDemoMode);

    return () => {
      window.removeEventListener('storage', checkDemoMode);
      window.removeEventListener('demoModeChanged', checkDemoMode);
    };
  }, []);

  return demoEnabled;
}
