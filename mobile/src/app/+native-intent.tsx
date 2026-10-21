import { rememberSharedVenue, venueIdFromLink } from '@/lib/venue-links';
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const venueId = venueIdFromLink(path);
    if (!venueId) return path;
    await rememberSharedVenue(venueId);
    return '/';
  } catch { return '/'; }
}
