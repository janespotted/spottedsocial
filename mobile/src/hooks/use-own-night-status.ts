import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { endNightLocally, fetchOwnNightStatus, type OwnNightStatus } from '@/lib/night-status';
import { setActiveCity } from '@/lib/tonight';
import { useSession } from './use-session';

export const OWN_NIGHT_STATUS_KEY = 'own-night-status';

/**
 * Every query that shows the user's own status or depends on it. Invalidate
 * all of them after any status write so Plans, Profile, Map and Messages
 * can never disagree.
 */
export const NIGHT_STATUS_QUERY_KEYS = [
  OWN_NIGHT_STATUS_KEY,
  'map-data',
  'friends-out',
  'leaderboard',
  'profile-page',
  'plans',
] as const;

export function invalidateNightStatusQueries(queryClient: QueryClient): void {
  for (const key of NIGHT_STATUS_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
}

export interface OwnNightData {
  /** Profile city — also installed as the app-wide "tonight" time zone. */
  city: string;
  /** Tonight's answer, or null when the user has not answered since the last reset. */
  status: OwnNightStatus | null;
}

async function fetchOwnNightData(userId: string): Promise<OwnNightData> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('city, is_out')
    .eq('id', userId)
    .maybeSingle<{ city: string | null; is_out: boolean | null }>();
  const city = profile?.city ?? 'nyc';
  // Install the profile zone before anything computes an expiry tonight.
  setActiveCity(city);

  const status = await fetchOwnNightStatus(userId);

  // Nightly reset, client side: the last status has expired but the profile
  // still says "out" (pin + open check-in) — end the night now so nothing
  // looks live the morning after.
  if (!status && profile?.is_out) {
    try {
      await endNightLocally(userId);
    } catch {
      /* best effort — the read-time freshness filters still hide the pin */
    }
  }
  return { city, status };
}

/**
 * The signed-in user's own answer for tonight (Yes = out, TBD = planning,
 * No = home, Stop sharing = off) and their profile city. THE one status
 * query: the opening prompt gate, Plans, Profile, Map, Messages and the
 * arrival prompts all read this, so they stay in sync by construction.
 *
 * staleTime 0 + the AppState-driven focus manager means every foreground
 * re-checks, so a reset that happened while the app was backgrounded is
 * noticed immediately.
 */
export function useOwnNightStatus(opts: { refetchInterval?: number } = {}) {
  const { session } = useSession();
  return useQuery({
    queryKey: [OWN_NIGHT_STATUS_KEY, session?.user.id],
    enabled: !!session,
    staleTime: 0,
    refetchInterval: opts.refetchInterval,
    queryFn: () => fetchOwnNightData(session!.user.id),
  });
}
