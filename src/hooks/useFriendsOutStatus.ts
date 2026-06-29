import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';

export interface FriendOutStatus {
  user_id: string;
  status: 'out' | 'planning';
  venue_name: string | null;
  planning_neighborhood: string | null;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Shared hook for "friends out tonight" data.
 * Used by FriendsOutPill (Home) and Map pill so both show identical counts.
 */
export function useFriendsOutStatus() {
  const { user } = useAuth();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const demoEnabled = useDemoMode();

  return useQuery({
    queryKey: ['friends-out-status', friendIds, demoEnabled],
    queryFn: async () => {
      if (!friendIds || friendIds.length === 0) return { outFriends: [], planningFriends: [] };

      const { data } = await supabase
        .from('night_statuses')
        .select('user_id, status, venue_name, planning_neighborhood')
        .in('user_id', friendIds)
        .in('status', ['out', 'planning'])
        .gt('expires_at', new Date().toISOString());

      if (!data) return { outFriends: [], planningFriends: [] };

      // Build profile map from cached profiles
      const profileMap = new Map<string, { display_name: string; avatar_url: string | null; is_demo: boolean }>();
      for (const p of (allProfiles || [])) {
        profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url, is_demo: (p as any).is_demo === true });
      }

      // Fallback: fetch profiles not in cache
      const missingIds = data.map(s => s.user_id).filter(id => !profileMap.has(id));
      if (missingIds.length > 0) {
        const { data: fallback } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, is_demo')
          .in('id', missingIds);
        for (const p of fallback || []) {
          profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url, is_demo: p.is_demo === true });
        }
      }

      // Build demo user set for filtering
      const demoUserIds = new Set<string>();
      if (!demoEnabled) {
        for (const [id, profile] of profileMap) {
          if (profile.is_demo) demoUserIds.add(id);
        }
      }

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
