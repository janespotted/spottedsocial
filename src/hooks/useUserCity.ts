import { useState, useEffect } from 'react';
import { detectUserCity, type SupportedCity } from '@/lib/city-detection';

export function useUserCity() {
  const [city, setCity] = useState<SupportedCity>('nyc'); // Safe default
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    detectUserCity().then(detectedCity => {
      setCity(detectedCity);
      setIsLoading(false);
    });

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
