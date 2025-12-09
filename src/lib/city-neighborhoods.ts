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
    'Beverly Hills',
    'Culver City',
    'Atwater Village',
    'Hermosa Beach',
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
    'Hell\'s Kitchen',
    'Upper East Side',
    'Tribeca',
  ],
};

export const getCityLabel = (city: string): string => {
  return city === 'la' ? 'LA' : city.toUpperCase();
};
