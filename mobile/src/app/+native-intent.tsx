import { rememberSharedVenue, venueIdFromLink } from '@/lib/venue-links';
import { invitationCodeFromLink, rememberInvitation } from '@/lib/invitation-links';
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const code = invitationCodeFromLink(path);
    if (code) { await rememberInvitation(code); return '/'; }
    const venueId = venueIdFromLink(path);
    if (!venueId) return path;
    await rememberSharedVenue(venueId);
    return '/';
  } catch { return '/'; }
}
