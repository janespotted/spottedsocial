// Neighborhoods available for filtering in each city
// These are derived from actual venue data in the database

export const CITY_NEIGHBORHOODS: Record<string, string[]> = {
  la: [
    'West Hollywood',
    'Hollywood',
    'Downtown LA',
    'Santa Monica',
    'Venice',
    'Silver Lake',
    'Echo Park',
    'Los Feliz',
    'Highland Park',
    'Koreatown',
    'Mid-Wilshire',
    'Manhattan Beach',
  ],
  nyc: [
    'Lower East Side',
    'East Village',
    'West Village',
    'SoHo',
    'Meatpacking',
    'Chelsea',
    'Flatiron',
    'Midtown',
    'Williamsburg',
    'Bushwick',
    'Greenpoint',
    'Carroll Gardens',
    'Ridgewood',
    'Financial District',
  ],
};

export const getCityLabel = (city: string): string => {
  return city === 'la' ? 'LA' : city.toUpperCase();
};
