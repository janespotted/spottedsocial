import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Treat auto-generated placeholder avatars as no avatar
const sanitizeAvatarUrl = (url: string | null): string | null =>
  url && url.includes('dicebear.com') ? null : url;

export function useProfilesSafe() {
  return useQuery({
    queryKey: ['profiles-safe'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profiles_safe');
      if (error) throw error;
      return (data || []).map((p: any) => ({ ...p, avatar_url: sanitizeAvatarUrl(p.avatar_url) }));
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60_000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
