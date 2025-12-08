// Neighborhoods available for filtering in each city
// These are derived from actual venue data in the database

export const CITY_NEIGHBORHOODS: Record<string, string[]> = {
  la: [
    'West Hollywood',
    'Hollywood',
    'Santa Monica',
    'Silver Lake',
    'Downtown LA',
    'Venice',
    'Koreatown',
    'Los Feliz',
    'Echo Park',
    'Highland Park',
    'Mid-Wilshire',
    'Fairfax District',
    'Manhattan Beach',
    'Historic Core',
  ],
  nyc: [
    'SoHo',
    'East Village',
    'Lower East Side',
    'Meatpacking',
    'West Village',
    'Chelsea',
    'Williamsburg',
    'Bushwick',
    'Greenwich Village',
    'NoHo',
    'Tribeca',
    'Hell\'s Kitchen',
    'Financial District',
  ],
};

export const getCityLabel = (city: string): string => {
  return city === 'la' ? 'LA' : city.toUpperCase();
};
