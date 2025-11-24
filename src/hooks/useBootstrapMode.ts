import { useState, useEffect } from 'react';
import { getBootstrapMode } from '@/lib/bootstrap-config';

export function useBootstrapMode() {
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);

  useEffect(() => {
    const checkBootstrapMode = () => {
      const mode = getBootstrapMode();
      setBootstrapEnabled(mode.enabled);
    };

    checkBootstrapMode();
    
    // Listen for storage changes (when bootstrap mode is toggled in another tab/component)
    window.addEventListener('storage', checkBootstrapMode);
    
    // Also listen for custom event (when bootstrap mode is toggled in same tab)
    window.addEventListener('bootstrapModeChanged', checkBootstrapMode);

    return () => {
      window.removeEventListener('storage', checkBootstrapMode);
      window.removeEventListener('bootstrapModeChanged', checkBootstrapMode);
    };
  }, []);

  return bootstrapEnabled;
}
