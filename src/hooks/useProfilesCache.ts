import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProfilesSafe() {
  return useQuery({
    queryKey: ['profiles-safe'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profiles_safe');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes
  });
}
