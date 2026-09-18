import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface SessionState {
  session: Session | null;
  loading: boolean;
  /** True when the signed-in user still needs name/username/welcome onboarding. */
  onboardingNeeded: boolean;
  /**
   * False until onboarding status is known for the current user. Anything
   * mounted OUTSIDE the root navigator (which unmounts while `loading`) must
   * check this: `onboardingNeeded` reads false while it is still unknown, so
   * treating that as "onboarded" activates gates during signup.
   */
  onboardingResolved: boolean;
  /** Re-check profile completeness (call after profile writes during onboarding). */
  refreshOnboardingStatus: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  session: null,
  loading: true,
  onboardingNeeded: false,
  onboardingResolved: false,
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
  // null = not yet known for the current user. The root navigator stays
  // unmounted until it resolves, so it is only ever re-evaluated when the
  // signed-in USER changes — never on a token refresh.
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);

  const refreshOnboardingStatus = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    setOnboardingNeeded(await fetchOnboardingNeeded(uid));
  }, []);

  useEffect(() => {
    // Keep ONE session object per signed-in user. Supabase emits a fresh
    // Session on INITIAL_SESSION, SIGNED_IN echoes and every hourly
    // TOKEN_REFRESHED; every hook in the app keys effects on `session`, so a
    // new identity re-ran every feed fetch and rebuilt every realtime channel
    // — and, through the onboarding effect below, unmounted and remounted the
    // whole navigator (kicking the user back to Home with skeletons). Nothing
    // reads access_token off this object (the client refreshes itself), so
    // the identity only needs to change when the user does. USER_UPDATED
    // carries changed profile fields (email/phone) and is taken as-is.
    const applySession = (next: Session | null, event: AuthChangeEvent | 'GET_SESSION') => {
      setSession((prev) => {
        if (prev && next && prev.user.id === next.user.id && event !== 'USER_UPDATED') return prev;
        return next;
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session, 'GET_SESSION');
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      applySession(next, event);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Re-evaluate onboarding status whenever the signed-in user changes
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setOnboardingNeeded(null);
      return;
    }
    let cancelled = false;
    setOnboardingNeeded(null);
    fetchOnboardingNeeded(userId).then((needed) => {
      if (!cancelled) setOnboardingNeeded(needed);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <SessionContext
      value={{
        session,
        loading: sessionLoading || (!!session && onboardingNeeded === null),
        onboardingNeeded: onboardingNeeded ?? false,
        onboardingResolved: !!session && onboardingNeeded !== null,
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
