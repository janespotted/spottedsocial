import { usePrivateQuery } from '@/hooks/use-private-query';
import { supabase } from '@/lib/supabase';

/** Shared by Profile and Activity; relationship events invalidate this key. */
export function useFriendRequestCount(userId: string | undefined) {
  return usePrivateQuery({
    queryKey: ['friend-requests-count', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('friend_id', userId!)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
}
