import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFriendIds(userId: string | undefined) {
  return useQuery({
    queryKey: ['friend-ids', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const [sentResult, receivedResult] = await Promise.all([
        supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', userId)
          .eq('status', 'accepted'),
        supabase
          .from('friendships')
          .select('user_id')
          .eq('friend_id', userId)
          .eq('status', 'accepted'),
      ]);

      const friendIds = [
        ...(sentResult.data?.map(f => f.friend_id) || []),
        ...(receivedResult.data?.map(f => f.user_id) || []),
      ];

      return [...new Set(friendIds)];
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000,
    enabled: !!userId,
    refetchOnWindowFocus: true,
  });
}
