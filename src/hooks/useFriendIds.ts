import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDemoMode } from '@/hooks/useDemoMode';

export function useFriendIds(userId: string | undefined) {
  const demoEnabled = useDemoMode();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['friend-ids', userId, demoEnabled],
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

      const uniqueIds = [...new Set(friendIds)];

      // Filter out demo users when demo mode is off
      if (!demoEnabled) {
        const profiles = queryClient.getQueryData<any[]>(['profiles-safe']);
        if (profiles) {
          const demoUserIds = new Set(
            profiles.filter((p: any) => p.is_demo).map((p: any) => p.id)
          );
          return uniqueIds.filter(id => !demoUserIds.has(id));
        }
        // If profiles not cached yet, fetch them
        try {
          const freshProfiles = await queryClient.fetchQuery({
            queryKey: ['profiles-safe'],
            queryFn: async () => {
              const { data } = await supabase.rpc('get_profiles_safe');
              return data || [];
            },
            staleTime: 30_000,
          });
          const demoUserIds = new Set(
            freshProfiles.filter((p: any) => p.is_demo).map((p: any) => p.id)
          );
          return uniqueIds.filter(id => !demoUserIds.has(id));
        } catch {
          return uniqueIds;
        }
      }

      return uniqueIds;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled: !!userId,
    refetchOnWindowFocus: true,
  });
}
