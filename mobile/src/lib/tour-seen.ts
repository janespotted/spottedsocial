import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Whether this account has finished the onboarding tour.
 *
 * Why this exists: onboarding completeness is derived from the profile
 * (display_name + username, see use-session), and the username step writes
 * both BEFORE the tour runs. Without a separate flag the gate flips to
 * "done" while the tour is still on screen, so quitting mid-tour dropped
 * the user straight into the tabs — they never saw the rest of it, and
 * never got the location prompt the tour asks for.
 *
 * The flag lives on the ACCOUNT (auth user_metadata), with a per-device
 * copy in AsyncStorage. It used to be device-only, and every reinstall,
 * new phone or simulator signed in with empty storage — so an existing
 * user was sent back through onboarding from the name step on every
 * fresh login. user_metadata comes with the session, so reading it costs
 * no request.
 *
 * Storage failures resolve to "seen". Losing the tour is a far smaller
 * harm than trapping someone in it on every launch with no way out.
 */

const key = (userId: string) => `spotted.tourSeen.${userId}`;
const METADATA_KEY = 'tour_seen';

export async function hasSeenTour(user: User): Promise<boolean> {
  if (user.user_metadata?.[METADATA_KEY] === true) return true;
  try {
    return (await AsyncStorage.getItem(key(user.id))) === '1';
  } catch {
    return true;
  }
}

export async function markTourSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), '1');
  } catch {
    /* best effort — the session continues either way */
  }
  // Merges into user_metadata. Offline it fails and the device copy above
  // still lets this phone through; the account-age rule in use-session
  // covers the next device.
  await supabase.auth.updateUser({ data: { [METADATA_KEY]: true } }).catch(() => {});
}
