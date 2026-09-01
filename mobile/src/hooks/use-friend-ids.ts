import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Accepted friendships in both directions, deduplicated.
 * Port of the web app's useFriendIds (demo users are excluded at the
 * profile layer — see fetchProfilesSafe).
 */
export function useFriendIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['friend-ids', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [sent, received] = await Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', userId!)
          .eq('status', 'accepted'),
        supabase
          .from('friendships')
          .select('user_id')
          .eq('friend_id', userId!)
          .eq('status', 'accepted'),
      ]);
      const ids = [
        ...(sent.data?.map((f) => f.friend_id) ?? []),
        ...(received.data?.map((f) => f.user_id) ?? []),
      ];
      return [...new Set(ids)];
    },
  });
}
