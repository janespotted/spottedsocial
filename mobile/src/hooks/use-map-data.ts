import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo-mode';
import { fetchProfilesSafe, type SafeProfile } from '@/lib/profiles';
import { isFromTonight } from '@/lib/tonight';
import { useFriendIds } from './use-friend-ids';
import { useOwnNightStatus } from './use-own-night-status';
import { useSession } from './use-session';

export type RelationshipType = 'close' | 'direct' | 'mutual';

export interface MapFriend {
  user_id: string;
  lat: number;
  lng: number;
  venue_name: string;
  display_name: string;
  avatar_url: string | null;
  relationshipType: RelationshipType;
  is_private_party: boolean;
  party_neighborhood: string | null;
  last_location_at: string | null;
}

export interface MapVenue {
  id: string;
  name: string;
  neighborhood: string | null;
  type: string | null;
  lat: number;
  lng: number;
  heatScore: number;
  is_map_promoted: boolean;
}

export interface MapData {
  friends: MapFriend[];
  venues: MapVenue[];
  /**
   * Friends with a live pin that are NOT in `friends` because the viewer
   * answered "No" tonight. Precise pins are gated until they update their
   * status; the count powers the aggregate cue + CTA instead.
   */
  hiddenFriendCount: number;
}

/**
 * Presence rule (addendum v3 §8.4): a friend is on the map while they are
 * out tonight with a shared spot — `is_out`, coordinates, and a location
 * stamp from tonight. Freshness is NOT an existence test: the watcher only
 * writes after 100 m of movement, so a friend standing in a venue with a
 * locked phone used to vanish after two hours while still checked in. A pin
 * leaves only for a real reason (Stop sharing, status change, the 5 AM
 * reset — all of which clear the profile spot server- or client-side).
 * Staleness is shown instead: the marker fades at 15 min and the friend
 * card says when they were last seen.
 */
function hasSharedSpot(p: SafeProfile): boolean {
  return (
    p.is_out === true &&
    p.last_known_lat !== null &&
    p.last_known_lng !== null &&
    isFromTonight(p.last_location_at)
  );
}

/**
 * Port of the web Map's data layer (src/pages/Map.tsx): friends who are out
 * with a shared spot from tonight (server-masked per viewer), expanded with
 * friends-of-friends who share to mutuals, relationship ring types, private
 * party handling, and city venues with popularity-based heat scores.
 */
async function fetchMapData(
  userId: string,
  city: string,
  directFriendIds: string[]
): Promise<MapData> {
  const nowIso = new Date().toISOString();
  const friendIds = [...directFriendIds];
  const profiles = await fetchProfilesSafe();

  // Friends who are out with a shared spot. Coordinates always come from
  // get_profiles_safe — the server masks them per viewer (SOW §4).
  const friendProfiles: SafeProfile[] = profiles.filter(
    (p) => friendIds.includes(p.id) && hasSharedSpot(p)
  );

  // Expand with friends-of-friends who share location with mutuals
  const { data: mutualData } = await supabase.rpc('get_mutual_friend_ids', {
    p_user_id: userId,
  });
  const mutualFriendIds = ((mutualData ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id
  );
  if (mutualFriendIds.length > 0) {
    const { data: mutualStatuses } = await supabase
      .from('night_statuses')
      .select('user_id')
      .in('user_id', mutualFriendIds)
      .eq('status', 'out')
      .not('expires_at', 'is', null)
      .gt('expires_at', nowIso);
    const outMutuals = new Set((mutualStatuses ?? []).map((s) => s.user_id));
    for (const p of profiles) {
      if (!outMutuals.has(p.id) || !hasSharedSpot(p)) continue;
      if (p.location_sharing_level !== 'mutual_friends') continue;
      if (!friendProfiles.some((fp) => fp.id === p.id)) friendProfiles.push(p);
      if (!friendIds.includes(p.id)) friendIds.push(p.id);
    }
  }

  // Night statuses → venue names, planning exclusion, private parties
  const venueNameByUser: Record<string, string> = {};
  const planningUserIds = new Set<string>();
  // Party rows carry only the neighborhood; the exact spot is filled in
  // below from party_locations, which RLS serves to close friends only.
  const privateParty: Record<
    string,
    { party_neighborhood: string | null; lat: number | null; lng: number | null }
  > = {};
  const demoOutStatuses: Array<{ user_id: string; venue_name: string | null; lat: number; lng: number }> = [];
  if (friendIds.length > 0 || DEMO_MODE) {
    let statusQuery = supabase
      .from('night_statuses')
      .select(
        'user_id, venue_name, status, is_private_party, party_neighborhood, is_demo, lat, lng'
      )
      .not('expires_at', 'is', null)
      .gt('expires_at', nowIso);
    // In dev, demo statuses are visible beyond the friend set (web demo mode)
    if (!DEMO_MODE) statusQuery = statusQuery.in('user_id', friendIds);
    const { data: statuses } = await statusQuery;
    for (const s of statuses ?? []) {
      if (s.status === 'planning') {
        planningUserIds.add(s.user_id);
      } else if (s.venue_name) {
        venueNameByUser[s.user_id] = s.venue_name;
      }
      if (s.is_private_party) {
        privateParty[s.user_id] = {
          party_neighborhood: s.party_neighborhood ?? null,
          lat: null,
          lng: null,
        };
      }
      if (DEMO_MODE && s.is_demo && s.status === 'out' && s.lat && s.lng) {
        demoOutStatuses.push({ user_id: s.user_id, venue_name: s.venue_name, lat: s.lat, lng: s.lng });
      }
    }
  }

  // Exact party spots: the server returns a row only when the viewer is a
  // close friend of the host (or the host). No row → no pin, by design.
  const partyHostIds = Object.keys(privateParty);
  if (partyHostIds.length > 0) {
    const { data: partySpots } = await supabase
      .from('party_locations')
      .select('user_id, lat, lng')
      .in('user_id', partyHostIds);
    for (const spot of partySpots ?? []) {
      const pp = privateParty[spot.user_id];
      if (pp) {
        pp.lat = spot.lat;
        pp.lng = spot.lng;
      }
    }
  }

  // Relationship ring types: close > mutual (friend-of-friend) > direct
  const { data: closeFriends } = await supabase
    .from('close_friends')
    .select('close_friend_id')
    .eq('user_id', userId);
  const closeFriendIds = new Set((closeFriends ?? []).map((cf) => cf.close_friend_id));
  const mutualIdSet = new Set(mutualFriendIds);
  const relationshipOf = (id: string): RelationshipType =>
    closeFriendIds.has(id) ? 'close' : mutualIdSet.has(id) ? 'mutual' : 'direct';

  const friends: MapFriend[] = [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Venue check-ins: live profile pin (server-masked per viewer, freshness-gated)
  for (const p of friendProfiles) {
    if (planningUserIds.has(p.id)) continue; // planning ≠ out
    if (privateParty[p.id]) continue; // parties are pinned below, from party_locations
    friends.push({
      user_id: p.id,
      lat: p.last_known_lat!,
      lng: p.last_known_lng!,
      venue_name: venueNameByUser[p.id] || '',
      display_name: p.display_name || 'Unknown',
      avatar_url: p.avatar_url,
      relationshipType: relationshipOf(p.id),
      is_private_party: false,
      party_neighborhood: null,
      last_location_at: p.last_location_at,
    });
  }

  // Private parties: a pin exists only when party_locations gave us the spot
  // (close friend of the host). A party does not move, so it never fades.
  for (const hostId of partyHostIds) {
    const pp = privateParty[hostId];
    if (pp.lat === null || pp.lng === null) continue;
    if (planningUserIds.has(hostId)) continue;
    const p = profileById.get(hostId);
    if (!p) continue;
    friends.push({
      user_id: hostId,
      lat: pp.lat,
      lng: pp.lng,
      venue_name: `Private Party${pp.party_neighborhood ? ` (${pp.party_neighborhood})` : ''}`,
      display_name: p.display_name || 'Unknown',
      avatar_url: p.avatar_url,
      relationshipType: relationshipOf(hostId),
      is_private_party: true,
      party_neighborhood: pp.party_neighborhood,
      last_location_at: nowIso,
    });
  }

  // Dev only: demo users pin from their night_statuses GPS (their profiles
  // don't carry live coords). Ring types cycle like the web demo branch.
  if (DEMO_MODE && demoOutStatuses.length > 0) {
    const relCycle: RelationshipType[] = ['close', 'direct', 'mutual'];
    demoOutStatuses.forEach((s, i) => {
      if (friends.some((f) => f.user_id === s.user_id)) return;
      const p = profileById.get(s.user_id);
      if (!p) return;
      friends.push({
        user_id: s.user_id,
        lat: s.lat,
        lng: s.lng,
        venue_name: s.venue_name || 'Out',
        display_name: p.display_name || 'Unknown',
        avatar_url: p.avatar_url,
        relationshipType: relCycle[i % relCycle.length],
        is_private_party: false,
        party_neighborhood: null,
        last_location_at: nowIso,
      });
    });
  }

  // Venues with heat scores: friends present ×10 + inverted popularity rank
  const { data: venuesData } = await supabase
    .from('venues')
    .select('id, name, neighborhood, type, lat, lng, popularity_rank, is_map_promoted')
    .eq('city', city)
    .eq('is_demo', false);
  const venues: MapVenue[] = (venuesData ?? [])
    .filter((v) => v.lat !== null && v.lng !== null)
    .map((v) => {
      const friendsAtVenue = friends.filter(
        (f) => f.venue_name.toLowerCase() === v.name.toLowerCase()
      ).length;
      return {
        id: v.id,
        name: v.name,
        neighborhood: v.neighborhood,
        type: v.type,
        lat: v.lat as number,
        lng: v.lng as number,
        heatScore: friendsAtVenue * 10 + (100 - (v.popularity_rank ?? 50)),
        is_map_promoted: v.is_map_promoted ?? false,
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore);

  return { friends, venues, hiddenFriendCount: 0 };
}

export function useMapData(city: string | null) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const { data: own } = useOwnNightStatus();
  const viewerStayingIn = own?.status?.status === 'home';

  const query = useQuery({
    queryKey: ['map-data', city, friendIds ?? []],
    enabled: !!session && !!city && friendIds !== undefined,
    staleTime: 30_000,
    queryFn: () => fetchMapData(session!.user.id, city!, friendIds ?? []),
  });

  // "No" tonight: keep venues (browsing still works) but withhold precise
  // friend pins; surface only how many there are. Memoized so the friends
  // array identity is stable for the map's clustering memo.
  const data = useMemo<MapData | undefined>(() => {
    if (!query.data || !viewerStayingIn) return query.data;
    return { ...query.data, friends: [], hiddenFriendCount: query.data.friends.length };
  }, [query.data, viewerStayingIn]);

  // Ids whose profile updates matter: direct friends plus whoever is pinned
  // now (mutuals). Kept in a ref so the channel never has to resubscribe.
  const watchedIds = useRef<Set<string>>(new Set());
  watchedIds.current = new Set([
    ...(friendIds ?? []),
    ...(query.data?.friends.map((f) => f.user_id) ?? []),
  ]);

  // Realtime, debounced (web map parity): night-status changes move pins,
  // and a friend's profile update is their first pin of the night or a
  // fresh fix — without this the viewer waited for the 30 s stale window
  // or a tab switch to see a friend appear (addendum v3 §8.4).
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['map-data'] });
      }, 1500);
    };
    const teardown = createResilientChannel({
      name: 'map-realtime',
      onReconnect: refresh,
      configure: (ch) =>
        ch
          .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles' },
            (payload) => {
              // `old` carries only the primary key (no REPLICA IDENTITY FULL),
              // so any update to a watched friend refreshes — the debounce
              // absorbs the rare profile edit.
              const row = payload.new as { id?: string } | null;
              if (row?.id && watchedIds.current.has(row.id)) refresh();
            }
          ),
    });
    return () => {
      clearTimeout(timer);
      teardown();
    };
  }, [session, queryClient]);

  return { ...query, data };
}
