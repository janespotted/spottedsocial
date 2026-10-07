import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from './use-session';

export const AUTH_ACCOUNT_KEY = 'auth-account';

/**
 * The account as Supabase Auth has it — phone and linked identities — fetched
 * fresh: the session object in use-session deliberately keeps one identity per
 * user, so it does not re-read them after they change.
 */
export function useAuthAccount() {
  const { session } = useSession();
  return useQuery({
    queryKey: [AUTH_ACCOUNT_KEY, session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
}
