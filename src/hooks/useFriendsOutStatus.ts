import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useMutualFriendIds } from '@/hooks/useMutualFriendIds';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';

export type FriendRing = 'close' | 'friend' | 'mutual';

export interface FriendOutStatus {
  user_id: string;
  status: 'out' | 'planning';
  venue_name: string | null;
  planning_neighborhood: string | null;
  display_name: string;
  avatar_url: string | null;
  ring: FriendRing;
  lat: number | null;
  lng: number | null;
}

/**
 * Shared hook for "friends out tonight" data.
 * Includes mutual friends whose location_sharing_level = 'mutual_friends'.
 * Categorizes each friend into a privacy ring (close, friend, mutual).
 */
export function useFriendsOutStatus() {
  const { user } = useAuth();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: mutualFriendIds } = useMutualFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const demoEnabled = useDemoMode();

  return useQuery({
    queryKey: ['friends-out-status', friendIds, mutualFriendIds, demoEnabled],
    queryFn: async () => {
      if (!user?.id || !friendIds || friendIds.length === 0)
        return { outFriends: [], planningFriends: [] };

      // Fetch close friend IDs for the current user
      const { data: closeFriendRows } = await supabase
        .from('close_friends')
        .select('close_friend_id')
        .eq('user_id', user.id);
      const closeFriendIds = new Set((closeFriendRows || []).map(r => r.close_friend_id));

      // Combine direct + mutual friend IDs for the query
      const directFriendSet = new Set(friendIds);
      const mutualSet = new Set((mutualFriendIds || []).filter(id => !directFriendSet.has(id)));
      const allIds = [...directFriendSet, ...mutualSet];

      if (allIds.length === 0) return { outFriends: [], planningFriends: [] };

      // Fetch night statuses — RLS now handles visibility for both direct + mutual
      const { data } = await supabase
        .from('night_statuses')
        .select('user_id, status, venue_name, planning_neighborhood')
        .in('user_id', allIds)
        .in('status', ['out', 'planning'])
        .gt('expires_at', new Date().toISOString());

      if (!data) return { outFriends: [], planningFriends: [] };

      // Build profile map from cached profiles (includes lat/lng from get_profiles_safe)
      const profileMap = new Map<string, {
        display_name: string;
        avatar_url: string | null;
        is_demo: boolean;
        last_known_lat: number | null;
        last_known_lng: number | null;
        location_sharing_level: string | null;
      }>();
      for (const p of (allProfiles || [])) {
        profileMap.set(p.id, {
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          is_demo: (p as any).is_demo === true,
          last_known_lat: (p as any).last_known_lat ?? null,
          last_known_lng: (p as any).last_known_lng ?? null,
          location_sharing_level: (p as any).location_sharing_level ?? null,
        });
      }

      // Fallback for profiles not in cache
      const missingIds = data.map(s => s.user_id).filter(id => !profileMap.has(id));
      if (missingIds.length > 0) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, is_demo')
          .in('id', missingIds);
        for (const p of fallback || []) {
          profileMap.set(p.id, {
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            is_demo: p.is_demo === true,
            last_known_lat: null,
            last_known_lng: null,
            location_sharing_level: null,
          });
        }
      }

      // Filter out demo users when demo mode is off
      const demoUserIds = new Set<string>();
      if (!demoEnabled) {
        for (const [id, profile] of profileMap) {
          if (profile.is_demo) demoUserIds.add(id);
        }
      }

      // Determine ring for each user
      const getRing = (userId: string): FriendRing => {
        if (closeFriendIds.has(userId)) return 'close';
        if (directFriendSet.has(userId)) return 'friend';
        return 'mutual';
      };

      const enriched: FriendOutStatus[] = data
        .filter(s => !demoUserIds.has(s.user_id))
        .map(s => {
          const profile = profileMap.get(s.user_id);
          return {
            user_id: s.user_id,
            status: s.status as 'out' | 'planning',
            venue_name: s.venue_name || null,
            planning_neighborhood: s.planning_neighborhood || null,
            display_name: profile?.display_name || 'Friend',
            avatar_url: profile?.avatar_url || null,
            ring: getRing(s.user_id),
            lat: profile?.last_known_lat ?? null,
            lng: profile?.last_known_lng ?? null,
          };
        });

      return {
        outFriends: enriched.filter(f => f.status === 'out'),
        planningFriends: enriched.filter(f => f.status === 'planning'),
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled: !!user && !!friendIds && friendIds.length > 0,
    refetchOnWindowFocus: true,
  });
}
