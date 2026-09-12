import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { FriendCardBody } from '@/components/friend-id-card';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import type { MapFriend, RelationshipType } from '@/hooks/use-map-data';

const NEON = '#d4ff00';

/**
 * App-wide Friend ID card as a native form sheet (SOW §14 — every
 * name/avatar tap routes here via openFriendCard). Self-fetches from the
 * userId param: safe profile, relationship tier, tonight's venue.
 */
export default function FriendCardScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useSession();
  const currentUserId = session?.user.id;
  const { data: friendIds } = useFriendIds(currentUserId);

  const { data: friend } = useQuery({
    queryKey: ['friend-card', userId],
    enabled: !!userId && !!currentUserId && friendIds !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<MapFriend | null> => {
      const [profiles, { data: close }, { data: status }] = await Promise.all([
        fetchProfilesSafe(),
        supabase
          .from('close_friends')
          .select('close_friend_id')
          .eq('user_id', currentUserId!)
          .eq('close_friend_id', userId!)
          .maybeSingle(),
        supabase
          .from('night_statuses')
          .select('venue_name, is_private_party, party_neighborhood')
          .eq('user_id', userId!)
          .eq('status', 'out')
          .gt('expires_at', new Date().toISOString())
          .maybeSingle(),
      ]);
      const profile = profiles.find((p) => p.id === userId);
      if (!profile) return null;
      const relationshipType: RelationshipType = close
        ? 'close'
        : (friendIds ?? []).includes(profile.id)
          ? 'direct'
          : 'mutual';
      return {
        user_id: profile.id,
        lat: profile.last_known_lat ?? 0,
        lng: profile.last_known_lng ?? 0,
        venue_name: status?.venue_name ?? '',
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        relationshipType,
        is_private_party: status?.is_private_party ?? false,
        party_neighborhood: status?.party_neighborhood ?? null,
        last_location_at: profile.last_location_at,
      };
    },
  });

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
    <View className="bg-[#1a1030] pb-safe-offset-2">
      {friend ? (
        <FriendCardBody
          friend={friend}
          currentUserId={currentUserId ?? ''}
          onDismiss={() => router.back()}
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
