import { usePrivateQuery as useQuery } from './use-private-query';
import { useOwnNightStatus } from './use-own-night-status';
import { withholdLivePreview } from '@/lib/live-preview';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { fetchProfilesSafe } from '@/lib/profiles';
import editorial from '@/lib/hot-spots-editorial.json';
import { fetchVisibleVenuePresence } from '@/lib/venue-presence';
import { buildHotSpotsBoard, type HotSpotsCatalogVenue, type LeaderboardData } from '@/lib/hot-spots-board';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';
export type { LeaderboardFriend, LeaderboardVenue, BiggestMover, LeaderboardData } from '@/lib/hot-spots-board';

export async function fetchHotSpotsCatalog(city: string): Promise<HotSpotsCatalogVenue[]> {
  const rows: HotSpotsCatalogVenue[] = [];
  // Complete eligible catalog: explicit priorities cannot disappear behind a
  // scheduled popularity rank or a first-page limit. Public data only.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('venues')
      .select('id,name,city,neighborhood,popularity_rank,google_place_id,leaderboard_eligible,is_demo,is_leaderboard_promoted,leaderboard_promo_order,opened_at,operating_hours')
      .eq('city', city).eq('is_demo', false)
      .or(['leaderboard_eligible.eq.true', ...editorial.venues.filter(v => v.city === city && v.accessLabel === 'Members only' ).map(v => `google_place_id.eq.${v.googlePlaceId}`)].join(','))
      .order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function fetchLeaderboard(city: string, neighborhood: string | null, userId: string, friendIds: string[]): Promise<LeaderboardData> {
  const demo = isDemoMode();
  const [catalog, statuses, profiles] = await Promise.all([
    fetchHotSpotsCatalog(city), fetchVisibleVenuePresence(), fetchProfilesSafe(),
  ]);
  if (demo !== isDemoMode()) throw new Error('Demo changed. Refresh Hot Spots.');
  return buildHotSpotsBoard(catalog, statuses, profiles, { city, neighborhood, userId, friendIds, demo });
}

export function useLeaderboard(city: string | null, neighborhood: string | null) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { data: own } = useOwnNightStatus();
  const withheld = withholdLivePreview(own?.status?.status, !!own);
  const { data: friendIds } = useFriendIds(session?.user.id);
  const query = useQuery({
    queryKey: ['leaderboard', session?.user.id, city, neighborhood, friendIds ?? []],
    enabled: !!session && !!city, staleTime: 30_000,
    // Realtime can omit an update whose new row is no longer readable.
    // Refetch current state while foregrounded; never use polling as proof of attendance.
    refetchInterval: 30_000,
    queryFn: () => fetchLeaderboard(city!, neighborhood, session!.user.id, friendIds ?? []),
  });
  useEffect(() => {
    const expiry = query.data?.nextExpiryAt;
    if (!expiry) return;
    const timer = setTimeout(() => { void queryClient.resetQueries({ queryKey: ['leaderboard'] }); }, Math.max(0, expiry-Date.now()) + 10);
    return () => clearTimeout(timer);
  }, [query.data?.nextExpiryAt, queryClient]);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      void queryClient.invalidateQueries({ queryKey: ['venue-card'] });
    }, 500); };
    const teardown = createResilientChannel({ name: 'leaderboard-realtime', onReconnect: refresh,
      configure: ch => ch
        .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, refresh),
    });
    return () => { clearTimeout(timer); teardown(); };
  }, [session, queryClient]);
  return { ...query, data: query.data && withheld ? { ...query.data,
    venues: query.data.venues.map(v => ({ ...v, friends: [] })),
    biggestMover: query.data.biggestMover ? { ...query.data.biggestMover, friends: [] } : null,
  } : query.data };
}
