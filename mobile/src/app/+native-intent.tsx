import { isLaunchEntryLink } from '@/lib/launch-entry-link';
import { rememberSharedVenue, venueIdFromLink } from '@/lib/venue-links';
import { invitationCodeFromLink, rememberInvitation } from '@/lib/invitation-links';
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (isLaunchEntryLink(path)) return '/';
    const code = invitationCodeFromLink(path);
    if (code) { await rememberInvitation(code); return '/'; }
    const venueId = venueIdFromLink(path);
    if (!venueId) return path;
    await rememberSharedVenue(venueId);
    return '/';
  } catch { return '/'; }
}
