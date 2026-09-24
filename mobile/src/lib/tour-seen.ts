import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Keyed by user id, not device: signing in as someone else on the same
 * phone is a different account that has not seen the tour.
 *
 * Storage failures resolve to "seen". Losing the tour is a far smaller
 * harm than trapping someone in it on every launch with no way out.
 */

const key = (userId: string) => `spotted.tourSeen.${userId}`;

export async function hasSeenTour(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === '1';
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
}
