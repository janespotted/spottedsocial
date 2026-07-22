import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/hooks/useDemoMode';

export interface MutualFriend {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_demo: boolean;
}

/**
 * Returns the friends the current user SHARES with another specific user
 * (the intersection of both friend lists), with profile info for display.
 * Instagram-style: every returned person is already a direct friend of the
 * viewer. Not to be confused with useMutualFriendIds, which returns
 * friends-of-friends for visibility expansion.
 */
export function useMutualFriendsWith(otherUserId: string | undefined) {
  const demoEnabled = useDemoMode();

  return useQuery({
    queryKey: ['mutual-friends-with', otherUserId, demoEnabled],
    queryFn: async () => {
      if (!otherUserId) return [];

      const { data, error } = await supabase.rpc('get_mutual_friends_with', {
        p_other_id: otherUserId,
      });

      if (error) {
        console.error('[useMutualFriendsWith] Error:', error.message);
        return [];
      }

      const mutuals = (data || []) as MutualFriend[];

      // Hide demo users when demo mode is off, consistent with useFriendIds
      return demoEnabled ? mutuals : mutuals.filter((m) => !m.is_demo);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    enabled: !!otherUserId,
  });
}
