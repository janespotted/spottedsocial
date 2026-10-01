import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { supabase } from '@/lib/supabase';
import type { Audience } from '@/lib/audience';
import { useFriendIds } from './use-friend-ids';

export interface AudienceCounts {
  close_friends: number;
  all_friends: number;
  mutual_friends: number;
}

/**
 * How many people each audience tier currently reaches, so the picker can
 * say when a tier is empty instead of letting the user share into the void.
 */
export function useAudienceCounts(userId: string | undefined) {
  const { data: friendIds } = useFriendIds(userId);
  return useQuery({
    queryKey: ['audience-counts', userId, friendIds],
    enabled: !!userId && friendIds !== undefined,
    staleTime: 60_000,
    queryFn: async (): Promise<AudienceCounts> => {
      const [{ count: closeCount, error: closeError }, { data: mutualRows, error: mutualError }] = await Promise.all([
        supabase
          .from('close_friends')
          .select('close_friend_id', { count: 'exact', head: true })
          .eq('user_id', userId!),
        supabase.rpc('get_mutual_friend_ids', { p_user_id: userId! }),
      ]);
      if (closeError || mutualError) throw closeError ?? mutualError;
      const friends = friendIds?.length ?? 0;
      const mutuals = ((mutualRows ?? []) as Array<{ user_id: string }>).length;
      return {
        close_friends: closeCount ?? 0,
        all_friends: friends,
        mutual_friends: friends + mutuals,
      };
    },
  });
}

export function audienceIsEmpty(counts: AudienceCounts | undefined, value: Audience): boolean {
  return !!counts && counts[value] === 0;
}
