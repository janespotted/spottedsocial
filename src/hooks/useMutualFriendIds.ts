import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns IDs of friends-of-friends (people who share at least one mutual friend
 * but are NOT direct friends). Used for mutual_friends visibility expansion.
 */
export function useMutualFriendIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['mutual-friend-ids', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase.rpc('get_mutual_friend_ids', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[useMutualFriendIds] Error:', error.message);
        return [];
      }

      return (data || []).map((r: any) => r.user_id as string);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    enabled: !!userId,
  });
}
