import { useState, useEffect } from 'react';
import { detectUserCity, getCachedCity, type SupportedCity } from '@/lib/city-detection';

export function useUserCity() {
  // Synchronously initialize from localStorage cache to avoid race condition
  const [city, setCity] = useState<SupportedCity>(() => {
    try {
      return getCachedCity() || 'nyc';
    } catch {
      return 'nyc';
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only detect if no cached city exists
    const cached = getCachedCity();
    if (!cached) {
      detectUserCity().then(detectedCity => {
        setCity(detectedCity);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }

    // Listen for city changes (manual override, etc.)
    const handleCityChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ city: SupportedCity | null }>;
      if (customEvent.detail.city) {
        setCity(customEvent.detail.city);
      }
    };

    window.addEventListener('cityChanged', handleCityChanged);

    return () => {
      window.removeEventListener('cityChanged', handleCityChanged);
    };
  }, []);

  return { city, isLoading };
}
