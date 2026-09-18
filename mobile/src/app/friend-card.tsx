import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { getCurrentPosition } from '@/lib/background-location';
import { distanceMeters } from '@/lib/location-service';
import {
  fetchFriendRequestPending,
  fetchLocationHidden,
  fetchMutualFriendsWith,
} from '@/lib/friend-relationship';
import { FriendCardBody, type FriendCardData, type FriendStatusKind } from '@/components/friend-id-card';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useFriendsOut } from '@/hooks/use-friends-out';
import type { RelationshipType } from '@/hooks/use-map-data';
import { NEON } from '@/lib/theme';

const METERS_PER_MILE = 1609.34;

/**
 * App-wide Friend ID card as a native form sheet (SOW §14 — every
 * name/avatar tap routes here via openFriendCard, and since addendum v3 §1
 * the map's pins too). Self-fetches from the userId param: safe profile,
 * relationship tier, tonight's status with its variants, hide state,
 * distance from the viewer, mutual friends and pending request (mutuals).
 */
export default function FriendCardScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useSession();
  const currentUserId = session?.user.id;
  const { data: friendIds } = useFriendIds(currentUserId);
  const { data: friendsOut } = useFriendsOut();

  const { data: friend } = useQuery({
    queryKey: ['friend-card', userId],
    enabled: !!userId && !!currentUserId && friendIds !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<FriendCardData | null> => {
      const me = currentUserId!;
      const [profiles, { data: close }, { data: status }, locationHidden, myFix] = await Promise.all([
        fetchProfilesSafe(),
        supabase
          .from('close_friends')
          .select('close_friend_id')
          .eq('user_id', me)
          .eq('close_friend_id', userId!)
          .maybeSingle(),
        supabase
          .from('night_statuses')
          .select(
            'status, venue_name, is_private_party, party_neighborhood, planning_neighborhood, planning_venue_name'
          )
          .eq('user_id', userId!)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
        fetchLocationHidden(me, userId!),
        getCurrentPosition(),
      ]);
      const profile = profiles.find((p) => p.id === userId);
      if (!profile) return null;

      const relationshipType: RelationshipType = close
        ? 'close'
        : (friendIds ?? []).includes(profile.id)
          ? 'direct'
          : 'mutual';

      // Mutual tier extras (the original card's popover + Add Friend)
      const [mutualFriends, requestPending] =
        relationshipType === 'mutual'
          ? await Promise.all([fetchMutualFriendsWith(userId!), fetchFriendRequestPending(me, userId!)])
          : [[], false];

      // Tonight — the original card's status subtitle variants
      let statusKind: FriendStatusKind = 'unknown';
      let statusLine: string | null = null;
      if (status?.status === 'out') {
        statusKind = status.is_private_party ? 'party' : 'out';
      } else if (status?.status === 'planning') {
        statusKind = 'planning';
        statusLine = status.planning_venue_name
          ? `TBD tonight — thinking ${status.planning_venue_name}`
          : status.planning_neighborhood
            ? `TBD tonight — ${status.planning_neighborhood}`
            : 'TBD tonight — down for anything';
      } else if (status?.status === 'home') {
        statusKind = 'home';
        statusLine = 'In for the night';
      }

      const lat = profile.last_known_lat;
      const lng = profile.last_known_lng;
      const distanceMi =
        statusKind === 'out' && myFix && lat !== null && lng !== null
          ? distanceMeters(myFix.lat, myFix.lng, lat, lng) / METERS_PER_MILE
          : null;

      return {
        user_id: profile.id,
        lat: lat ?? 0,
        lng: lng ?? 0,
        venue_name: statusKind === 'out' ? (status?.venue_name ?? '') : '',
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        relationshipType,
        is_private_party: statusKind === 'party',
        party_neighborhood: status?.party_neighborhood ?? null,
        last_location_at: profile.last_location_at,
        username: profile.username || null,
        statusKind,
        statusLine,
        distanceMi,
        locationHidden,
        mutualFriends,
        requestPending,
      };
    },
  });

  // Friends at the same venue tonight (the "also here" avatars)
  const friendsAtVenue =
    friend?.venue_name && friendsOut
      ? friendsOut.outFriends
          .filter(
            (f) =>
              f.user_id !== friend.user_id &&
              (f.venue_name ?? '').toLowerCase() === friend.venue_name.toLowerCase()
          )
          .map((f) => ({ user_id: f.user_id, display_name: f.display_name, avatar_url: f.avatar_url }))
      : [];

  const openVenue = async (venueName: string) => {
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();
    if (!data?.id) return;
    router.back();
    setTimeout(() => router.push({ pathname: '/venue', params: { venueId: data.id } }), 250);
  };

  return (
    <View className="bg-[#1a0f2e] pb-safe-offset-2">
      {friend ? (
        <FriendCardBody
          data={friend}
          currentUserId={currentUserId ?? ''}
          onDismiss={() => router.back()}
          friendsAtVenue={friendsAtVenue}
          onOpenVenue={(name) => void openVenue(name)}
        />
      ) : (
        <View className="items-center justify-center py-16">
          <ActivityIndicator color={NEON} />
        </View>
      )}
    </View>
  );
}
