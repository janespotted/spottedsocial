import { usePrivateQuery as useQuery } from './use-private-query';
import { useOwnNightStatus } from './use-own-night-status';
import { withholdLivePreview } from '@/lib/live-preview';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { isVenueOpen, type VenueHours } from '@/lib/venue-hours';
import { isNightlifeHours } from '@/lib/time-context';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

/**
 * Bootstrap mode (hybrid demo/real leaderboard until critical mass) defaults
 * to ON in the web app, so its leaderboard always pre-populates the city's
 * top venues by popularity_rank even with zero check-ins. Mirror that here.
 */
const BOOTSTRAP_MODE = true;

export interface LeaderboardFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface LeaderboardVenue {
  venue_name: string;
  venue_id: string | null;
  neighborhood: string | null;
  count: number;
  rank: number;
  movement: 'up' | 'down' | 'same';
  friends: LeaderboardFriend[];
  energyLevel: number;
  isPromoted?: boolean;
  isNewlyOpened?: boolean;
  operatingHours?: VenueHours | null;
  recentCheckinCount: number; // Check-ins in last 30 mins for velocity
}

export interface BiggestMover {
  venue_name: string;
  venue_id: string | null;
  friends: LeaderboardFriend[];
}

export interface LeaderboardData {
  venues: LeaderboardVenue[];
  biggestMover: BiggestMover | null;
}

function calculateEnergyLevel(_rank: number, userCount: number): number {
  if (userCount >= 10) return 3;
  if (userCount >= 5) return 2;
  return userCount > 0 ? 1 : 0;
}

type MutableVenue = LeaderboardVenue & { popularity_rank: number };

async function fetchLeaderboard(
  city: string,
  neighborhood: string | null,
  userId: string,
  friendIds: string[]
): Promise<LeaderboardData> {
  // Night statuses with venue metadata, filtered by city (profiles join is
  // done separately via the safe RPC — direct joins are blocked by RLS)
  let statusQuery = supabase
    .from('night_statuses')
    .select(
      `
      venue_name,
      venue_id,
      user_id,
      updated_at,
      is_promoted,
      is_demo,
      venues!inner(popularity_rank, is_leaderboard_promoted, city, opened_at, operating_hours, neighborhood)
    `
    )
    .eq('venues.city', city)
    .not('venue_name', 'is', null)
    .eq('status', 'out')
    .not('expires_at', 'is', null)
    .gt('expires_at', new Date().toISOString());
  if (neighborhood) statusQuery = statusQuery.eq('venues.neighborhood', neighborhood);
  // Demo content must never reach the launched app (SOW §15)
  if (!isDemoMode()) statusQuery = statusQuery.eq('is_demo', false);

  // Promoted venues ordered by leaderboard_promo_order (active spots are order 1-2)
  let promotedQuery = supabase
    .from('venues')
    .select(
      'id, name, popularity_rank, is_leaderboard_promoted, leaderboard_promo_order, opened_at, neighborhood, operating_hours, city'
    )
    .eq('is_leaderboard_promoted', true)
    .eq('city', city)
    .not('leaderboard_promo_order', 'is', null)
    .lte('leaderboard_promo_order', 2)
    .order('leaderboard_promo_order', { ascending: true });
  if (neighborhood) promotedQuery = promotedQuery.eq('neighborhood', neighborhood);

  // Bootstrap: pre-populate from top venues so the board always shows 20
  const topVenuesQuery = neighborhood
    ? supabase
        .from('venues')
        .select('id, name, neighborhood, popularity_rank, is_leaderboard_promoted, opened_at, operating_hours')
        .eq('city', city)
        .eq('neighborhood', neighborhood)
        .order('popularity_rank', { ascending: true })
    : supabase
        .from('venues')
        .select('id, name, neighborhood, popularity_rank, is_leaderboard_promoted, opened_at, operating_hours')
        .eq('city', city)
        .order('popularity_rank', { ascending: true })
        .limit(30);

  const [promotedResult, statusesResult, topVenuesResult, profiles] = await Promise.all([
    promotedQuery,
    statusQuery,
    topVenuesQuery,
    fetchProfilesSafe(),
  ]);

  for (const result of [promotedResult, statusesResult, topVenuesResult]) if (result.error) throw result.error;
  const promotedVenues = promotedResult.data ?? [];
  const statuses = (statusesResult.data ?? []) as unknown as Array<{ venue_name: string; venue_id: string; user_id: string; updated_at: string | null; venues: { operating_hours?: VenueHours | null; opened_at?: string | null; neighborhood?: string | null; popularity_rank?: number | null } }>;
  const topVenues = topVenuesResult.data ?? [];
  const profileMap = buildProfileMap(profiles);

  const activePromotedIds = new Set(promotedVenues.map((v) => v.id));

  // Newly opened = within the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  // 30 minutes ago for velocity tracking
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const venueMap = new Map<string, MutableVenue>();

  if (BOOTSTRAP_MODE) {
    topVenues.forEach((venue, index) => {
      const isNewlyOpened = venue.opened_at ? new Date(venue.opened_at) > threeMonthsAgo : false;
      const rank = index + 1;
      venueMap.set(venue.name, {
        venue_name: venue.name,
        venue_id: venue.id,
        neighborhood: venue.neighborhood ?? null,
        count: 0,
        rank,
        movement: 'same',
        friends: [],
        energyLevel: 0,
        isPromoted: venue.is_leaderboard_promoted ?? false,
        isNewlyOpened,
        popularity_rank: venue.popularity_rank ?? 999,
        operatingHours: (venue.operating_hours as VenueHours | null) ?? null,
        recentCheckinCount: 0,
      });
    });
  }

  // Add ONLY active promoted venues (order 1-2) to ensure they appear
  promotedVenues.forEach((venue) => {
    if (venueMap.has(venue.name)) return;
    const isNewlyOpened = venue.opened_at ? new Date(venue.opened_at) > threeMonthsAgo : false;
    venueMap.set(venue.name, {
      venue_name: venue.name,
      venue_id: venue.id,
      neighborhood: venue.neighborhood ?? null,
      count: 0,
      rank: 0,
      movement: 'same',
      friends: [],
      energyLevel: 0,
      isPromoted: true,
      isNewlyOpened,
      popularity_rank: venue.popularity_rank ?? 999,
      operatingHours: (venue.operating_hours as VenueHours | null) ?? null,
      recentCheckinCount: 0,
    });
  });

  // Fold in live night statuses
  statuses.forEach((status) => {
    const venueName = status.venue_name as string;
    const venueMeta = status.venues ?? {};
    const statusProfile = profileMap.get(status.user_id);
    // In release builds demo statuses are filtered at the query; in dev the
    // profile map still resolves demo users so they count like the web app.
    const operatingHours = (venueMeta.operating_hours as VenueHours | null) ?? null;
    const isNewlyOpened = venueMeta.opened_at
      ? new Date(venueMeta.opened_at) > threeMonthsAgo
      : false;
    const updatedAt = status.updated_at ? new Date(status.updated_at) : null;
    const isRecentCheckin = !!updatedAt && updatedAt > thirtyMinutesAgo;

    if (!venueMap.has(venueName)) {
      venueMap.set(venueName, {
        venue_name: venueName,
        venue_id: status.venue_id ?? null,
        neighborhood: venueMeta.neighborhood ?? null,
        count: 0,
        rank: 0,
        movement: 'same',
        friends: [],
        energyLevel: 0,
        isPromoted: activePromotedIds.has(status.venue_id),
        isNewlyOpened,
        popularity_rank: venueMeta.popularity_rank ?? 999,
        operatingHours,
        recentCheckinCount: 0,
      });
    }

    const venue = venueMap.get(venueName)!;
    venue.count++; // Count ALL users for energy calculation
    if (isRecentCheckin) venue.recentCheckinCount++;
    if (!venue.operatingHours && operatingHours) venue.operatingHours = operatingHours;

    // Only show avatars for the current user's friends
    if (status.user_id !== userId && friendIds.includes(status.user_id)) {
      venue.friends.push({
        user_id: status.user_id,
        display_name: statusProfile?.display_name || statusProfile?.username || 'Anonymous',
        avatar_url: statusProfile?.avatar_url ?? null,
      });
    }
  });

  const venueArray = Array.from(venueMap.values());

  // Only show open venues — EXCEPT promoted venues, which always appear
  // (paid placement guarantee). No hours data → only during nightlife hours.
  const openVenueArray = venueArray.filter((v) => {
    if (v.isPromoted) return true;
    if (!v.operatingHours) return isNightlifeHours();
    return isVenueOpen(v.operatingHours);
  });

  const topPromotedVenues = openVenueArray
    .filter((v) => v.isPromoted)
    .sort((a, b) => a.popularity_rank - b.popularity_rank);

  const nonPromotedVenues = openVenueArray
    .filter((v) => !v.isPromoted)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.popularity_rank - b.popularity_rank;
    });

  // Top 20 non-promoted venues get ranks; movement remains neutral until measured history exists
  const rankedVenues = nonPromotedVenues.slice(0, 20).map((venue, index) => {
    const rank = index + 1;
    return {
      ...venue,
      rank,
      movement: 'same' as const,
      energyLevel: calculateEnergyLevel(rank, venue.count),
    };
  });

  const promotedWithProps = topPromotedVenues.map((venue) => ({
    ...venue,
    rank: 0, // No rank for promoted
    movement: 'same' as const,
    energyLevel: calculateEnergyLevel(1, venue.count), // Treat as rank 1
  }));

  const finalVenues: LeaderboardVenue[] = [...promotedWithProps, ...rankedVenues];

  // Biggest mover fallback chain:
  // 1. open venues with recent velocity, 2. open venues with any activity,
  // 3. any venue with measured activity. Catalog-only venues are never a live claim.
  const openVenuesWithVelocity = nonPromotedVenues
    .filter((v) => isVenueOpen(v.operatingHours ?? null))
    .filter((v) => v.recentCheckinCount > 0)
    .sort((a, b) => b.recentCheckinCount - a.recentCheckinCount);
  const openVenuesWithActivity = nonPromotedVenues
    .filter((v) => isVenueOpen(v.operatingHours ?? null))
    .filter((v) => v.count > 0)
    .sort((a, b) => b.count - a.count);
  const anyVenueWithActivity = nonPromotedVenues
    .filter((v) => v.count > 0)
    .sort((a, b) => b.count - a.count);
  const moverVenue = openVenuesWithVelocity[0] || openVenuesWithActivity[0] || anyVenueWithActivity[0];

  const biggestMover: BiggestMover | null = moverVenue
    ? {
        venue_name: moverVenue.venue_name,
        venue_id: moverVenue.venue_id,
        friends: 'friends' in moverVenue ? moverVenue.friends.slice(0, 3) : [],
      }
    : null;

  return { venues: finalVenues, biggestMover };
}

export function useLeaderboard(city: string | null, neighborhood: string | null) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { data: own } = useOwnNightStatus();
  const withheld = withholdLivePreview(own?.status?.status, !!own);
  const { data: friendIds } = useFriendIds(session?.user.id);

  const query = useQuery({
    queryKey: ['leaderboard', session?.user.id, city, neighborhood, friendIds ?? []],
    enabled: !!session && !!city,
    staleTime: 30_000,
    queryFn: () => fetchLeaderboard(city!, neighborhood, session!.user.id, friendIds ?? []),
  });

  // Realtime: any check-in / night-status change refreshes the board,
  // debounced 1.5s (port of the web leaderboard-realtime channel)
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      }, 1500);
    };
    const teardown = createResilientChannel({
      name: 'leaderboard-realtime',
      onReconnect: refresh,
      configure: (ch) =>
        ch
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, refresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh),
    });
    return () => {
      clearTimeout(timer);
      teardown();
    };
  }, [session, queryClient]);

  return { ...query, data: query.data && withheld ? { ...query.data, venues: query.data.venues.map(v => ({ ...v, friends: [] })), biggestMover: query.data.biggestMover ? { ...query.data.biggestMover, friends: [] } : null } : query.data };
}
