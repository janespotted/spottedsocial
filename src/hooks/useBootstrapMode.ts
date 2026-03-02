import { useState, useEffect } from 'react';
import { getBootstrapMode } from '@/lib/bootstrap-config';
import type { SupportedCity } from '@/lib/city-detection';

export function useBootstrapMode() {
  const [bootstrapEnabled, setBootstrapEnabled] = useState(() => {
    try {
      return getBootstrapMode().enabled;
    } catch {
      return false;
    }
  });
  const [city, setCity] = useState<SupportedCity>(() => {
    try {
      return getBootstrapMode().city;
    } catch {
      return 'nyc';
    }
  });

  useEffect(() => {
    const checkBootstrapMode = () => {
      const mode = getBootstrapMode();
      setBootstrapEnabled(mode.enabled);
      setCity(mode.city);
    };

    checkBootstrapMode();
    
    // Listen for storage changes (when bootstrap mode is toggled in another tab/component)
    window.addEventListener('storage', checkBootstrapMode);
    
    // Also listen for custom event (when bootstrap mode is toggled in same tab)
    window.addEventListener('bootstrapModeChanged', checkBootstrapMode);

    // Listen for city detection (GPS resolved) so bootstrap city updates reactively
    window.addEventListener('cityChanged', checkBootstrapMode);

    return () => {
      window.removeEventListener('storage', checkBootstrapMode);
      window.removeEventListener('bootstrapModeChanged', checkBootstrapMode);
      window.removeEventListener('cityChanged', checkBootstrapMode);
    };
  }, []);

  return { bootstrapEnabled, city };
}
