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
  ],
  nyc: [
    'Lower East Side',
    'East Village',
    'West Village',
    'Greenwich Village',
    'NoHo',
    'SoHo',
    'Meatpacking',
    'Chelsea',
    'Hudson Square',
    'Midtown',
    'Midtown East',
    'Williamsburg',
    'Greenpoint',
    'Bushwick',
    'Boerum Hill',
    'Clinton Hill',
    'Bed-Stuy',
    'Astoria',
    'Harlem',
  ],
  pb: [
    'Worth Avenue',
    'Via Mizner',
    'Royal Poinciana Way',
    'Brazilian Ave',
    'Clematis Street',
    'CityPlace',
    'Northwood Village',
    'Warehouse District',
    'Grandview Heights',
  ],
};

export const getCityLabel = (city: string): string => {
  if (city === 'la') return 'LA';
  if (city === 'pb') return 'Palm Beach';
  return city.toUpperCase();
};
