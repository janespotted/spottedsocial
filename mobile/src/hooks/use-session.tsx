import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { launchRpc, type LaunchState } from '@/lib/launch';
import { setDemoAuthorization } from '@/lib/demo-mode';
import { getSessionRevision, setSessionIdentity } from '@/lib/session-identity';

interface SessionState {
  session: Session | null;
  launch: LaunchState | null;
  loading: boolean;
  /** True when the signed-in user still needs admission, a profile, or two nominations. */
  onboardingNeeded: boolean;
  /**
   * False until onboarding status is known for the current user. Anything
   * mounted OUTSIDE the root navigator (which unmounts while `loading`) must
   * check this: `onboardingNeeded` reads false while it is still unknown, so
   * treating that as "onboarded" activates gates during signup.
   */
  onboardingResolved: boolean;
  onboardingError: string | null;
  /** Re-check profile completeness (call after profile writes during onboarding). */
  refreshOnboardingStatus: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  session: null,
  launch: null,
  loading: true,
  onboardingNeeded: false,
  onboardingResolved: false,
  onboardingError: null,
  refreshOnboardingStatus: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [launch, setLaunch] = useState<LaunchState | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // null = not yet known for the current user. The root navigator stays
  // unmounted until it resolves, so it is only ever re-evaluated when the
  // signed-in USER changes — never on a token refresh.
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);

  const refreshOnboardingStatus = useCallback(async () => {
    const revision = getSessionRevision();
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    try {
      const state = await launchRpc('get_launch_state');
      const needed = !state.complete;
      if (revision === getSessionRevision()) { setLaunch(state); setDemoAuthorization(state.cityTester || state.waveAdmin); setOnboardingNeeded(needed); setOnboardingError(null); }
    } catch (error) {
      if (revision === getSessionRevision()) setOnboardingError('Could not load your profile. Your account has not been reset.');
      throw error;
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let authEventSeen = false;
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
      if (disposed) return;
      setSessionIdentity(next?.user.id ?? null, next?.access_token ?? null);
      setSession((prev) => {
        if (prev && next && prev.user.id === next.user.id && event !== 'USER_UPDATED') return prev;
        return next;
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!authEventSeen) applySession(data.session, 'GET_SESSION');
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      authEventSeen = true;
      applySession(next, event);
      setSessionLoading(false);
    });
    return () => { disposed = true; sub.subscription.unsubscribe(); };
  }, []);

  // Re-evaluate onboarding status whenever the signed-in user changes
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setLaunch(null); setDemoAuthorization(false); setOnboardingNeeded(null); setOnboardingError(null);
      return;
    }
    let cancelled = false;
    setLaunch(null); setDemoAuthorization(false); setOnboardingNeeded(null); setOnboardingError(null);
    launchRpc('get_launch_state').then((state) => {
      if (!cancelled) { setLaunch(state); setDemoAuthorization(state.cityTester || state.waveAdmin); setOnboardingNeeded(!state.complete); }
    }).catch(() => {
      if (!cancelled) setOnboardingError('Could not load your profile. Your account has not been reset.');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <SessionContext
      value={{
        session,
        launch,
        loading: sessionLoading || (!!session && onboardingNeeded === null && !onboardingError),
        onboardingError,
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
