/**
 * Build a URL to the get-venue-photo proxy edge function.
 * This avoids leaking the Google API key to the client.
 */
export function getVenuePhotoUrl(venueId: string, index: number): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/get-venue-photo?venueId=${venueId}&index=${index}`;
}
