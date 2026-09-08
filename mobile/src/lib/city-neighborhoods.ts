/** Direct port of the web src/lib/city-neighborhoods.ts. */

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
    'Flatiron',
    'Gramercy',
    'NoMad',
    'Hudson Square',
    'Midtown',
    'Midtown East',
    'Financial District',
    'Dimes Square',
    'Downtown Brooklyn',
    'Williamsburg',
    'Greenpoint',
    'Bushwick',
    'Ridgewood',
    'Gowanus',
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

// Map camera centers per city (from the web src/lib/city-detection.ts)
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  nyc: { lat: 40.7128, lng: -74.006 },
  la: { lat: 34.0522, lng: -118.2437 },
  pb: { lat: 26.7056, lng: -80.0364 },
};

export const getCityLabel = (city: string): string => {
  if (city === 'la') return 'LA';
  if (city === 'pb') return 'Palm Beach';
  return city.toUpperCase();
};
