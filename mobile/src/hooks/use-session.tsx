import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface SessionState {
  session: Session | null;
  loading: boolean;
  /** True when the signed-in user still needs name/username/welcome onboarding. */
  onboardingNeeded: boolean;
  /** Re-check profile completeness (call after profile writes during onboarding). */
  refreshOnboardingStatus: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  onboardingNeeded: false,
  refreshOnboardingStatus: async () => {},
});

/** A complete profile (name + username) marks onboarding as done.
 * NOTE: do not gate on a profiles column like `has_onboarded` — it does not
 * exist in the production schema, and a failed select here silently locks
 * users inside onboarding forever. */
async function fetchOnboardingNeeded(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .maybeSingle();
  return !(data?.display_name && data?.username);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);

  const refreshOnboardingStatus = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    setOnboardingNeeded(await fetchOnboardingNeeded(uid));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Re-evaluate onboarding status whenever the signed-in user changes
  useEffect(() => {
    if (!session) {
      setOnboardingNeeded(false);
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    fetchOnboardingNeeded(session.user.id).then((needed) => {
      if (cancelled) return;
      setOnboardingNeeded(needed);
      setStatusLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <SessionContext
      value={{
        session,
        loading: sessionLoading || statusLoading,
        onboardingNeeded,
        refreshOnboardingStatus,
      }}
    >
      {children}
    </SessionContext>
  );
}

export function useSession() {
  return use(SessionContext);
}
