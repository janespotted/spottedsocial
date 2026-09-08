import type { SFSymbol } from 'expo-symbols';

/**
 * Photo URL via the get-venue-photo proxy edge function (keeps the Google
 * API key server-side). The function is public — plain <Image> URLs work.
 */
export function getVenuePhotoUrl(venueId: string, index: number): string {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return `${base}/functions/v1/get-venue-photo?venueId=${venueId}&index=${index}`;
}

/** Port of the web getVenueTypeDisplay, with SF Symbols instead of lucide. */
export function getVenueTypeDisplay(type: string): { label: string; icon: SFSymbol } {
  const typeMap: Record<string, { label: string; icon: SFSymbol }> = {
    bar: { label: 'Bar', icon: 'mug.fill' },
    cocktail_bar: { label: 'Cocktail Lounge', icon: 'wineglass.fill' },
    nightclub: { label: 'Club', icon: 'music.note' },
    rooftop: { label: 'Rooftop', icon: 'building.2.fill' },
    speakeasy: { label: 'Speakeasy', icon: 'eye.slash.fill' },
    lounge: { label: 'Lounge', icon: 'sofa.fill' },
    dive_bar: { label: 'Dive Bar', icon: 'mug.fill' },
  };
  return (
    typeMap[type] ?? {
      label: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: 'mappin',
    }
  );
}

/** Haversine, in miles, one decimal — same as web. */
export function calculateDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): string {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}
