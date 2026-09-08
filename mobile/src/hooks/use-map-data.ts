import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo-mode';
import { fetchProfilesSafe, type SafeProfile } from '@/lib/profiles';
import { isFreshLocation } from '@/lib/time-context';
import { useFriendIds } from './use-friend-ids';
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
}

/**
 * Port of the web Map's data layer (src/pages/Map.tsx): friends who are out
 * with fresh (tonight + <2h) server-masked locations, expanded with
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

  // Friends who are out with valid, fresh location data. Coordinates always
  // come from get_profiles_safe — the server masks them per viewer (SOW §4).
  const friendProfiles: SafeProfile[] = profiles.filter(
    (p) =>
      friendIds.includes(p.id) &&
      p.is_out === true &&
      p.last_known_lat !== null &&
      p.last_known_lng !== null &&
      isFreshLocation(p.last_location_at)
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
      if (!outMutuals.has(p.id) || p.is_out !== true) continue;
      if (p.location_sharing_level !== 'mutual_friends') continue;
      if (p.last_known_lat === null || p.last_known_lng === null) continue;
      if (!isFreshLocation(p.last_location_at)) continue;
      if (!friendProfiles.some((fp) => fp.id === p.id)) friendProfiles.push(p);
      if (!friendIds.includes(p.id)) friendIds.push(p.id);
    }
  }

  // Night statuses → venue names, planning exclusion, private parties
  const venueNameByUser: Record<string, string> = {};
  const planningUserIds = new Set<string>();
  const privateParty: Record<
    string,
    { party_neighborhood: string | null; lat: number | null; lng: number | null }
  > = {};
  let demoOutStatuses: Array<Record<string, any>> = [];
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
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        };
      }
      if (DEMO_MODE && s.is_demo && s.status === 'out' && s.lat && s.lng) {
        demoOutStatuses.push(s);
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
  for (const p of friendProfiles) {
    if (planningUserIds.has(p.id)) continue; // planning ≠ out
    const pp = privateParty[p.id];
    const relationship = relationshipOf(p.id);
    // Mutual friends at private parties get no map pin
    if (pp && relationship === 'mutual') continue;
    // Private parties: exact GPS from night_statuses for close/direct friends
    const lat = pp?.lat ?? p.last_known_lat!;
    const lng = pp?.lng ?? p.last_known_lng!;
    friends.push({
      user_id: p.id,
      lat,
      lng,
      venue_name: pp
        ? `Private Party${pp.party_neighborhood ? ` (${pp.party_neighborhood})` : ''}`
        : venueNameByUser[p.id] || '',
      display_name: p.display_name || 'Unknown',
      avatar_url: p.avatar_url,
      relationshipType: relationship,
      is_private_party: !!pp,
      party_neighborhood: pp?.party_neighborhood ?? null,
      last_location_at: p.last_location_at,
    });
  }

  // Dev only: demo users pin from their night_statuses GPS (their profiles
  // don't carry live coords). Ring types cycle like the web demo branch.
  if (DEMO_MODE && demoOutStatuses.length > 0) {
    const profileById = new Map(profiles.map((p) => [p.id, p]));
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

  return { friends, venues };
}

export function useMapData(city: string | null) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { data: friendIds } = useFriendIds(session?.user.id);

  const query = useQuery({
    queryKey: ['map-data', city, friendIds ?? []],
    enabled: !!session && !!city && friendIds !== undefined,
    staleTime: 30_000,
    queryFn: () => fetchMapData(session!.user.id, city!, friendIds ?? []),
  });

  // Realtime: night-status changes move pins, debounced (web map parity)
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['map-data'] });
      }, 1500);
    };
    const channel = supabase
      .channel('map-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'night_statuses' }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [session, queryClient]);

  return query;
}
