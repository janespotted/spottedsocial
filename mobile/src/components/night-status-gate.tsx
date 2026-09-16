import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { invalidateNightStatusQueries, useOwnNightStatus } from '@/hooks/use-own-night-status';
import {
  deferDeepLink,
  setNightGateState,
  takePendingDeepLink,
  useNightGateState,
} from '@/lib/night-gate';
import { nightResetAt } from '@/lib/tonight';

const GATE_HREF: Href = { pathname: '/check-in', params: { gate: '1' } };

// Screens the check-in sheet itself opens on top of the pending question.
const ALLOWED_ABOVE_GATE = new Set(['check-in', 'audience']);

// setTimeout overflows past ~24.8 days; clamp so a long-lived session
// re-arms instead of firing immediately.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Cold start with the status query hanging (offline, captive wifi): after
// this long, fail open instead of holding the cover screen forever. The
// gate still presents as soon as the query eventually resolves "unanswered".
const UNKNOWN_TIMEOUT_MS = 4_000;

// A navigation we just requested has not landed in the state yet; don't
// request it again on the next state change.
const NAV_IN_FLIGHT_MS = 1_000;

// Replay a parked deep link only after the sheet's dismiss animation.
const REPLAY_DELAY_MS = 400;

/**
 * Required opening status prompt.
 *
 * Mounted once at the root. Whenever a signed-in, onboarded user has no
 * answer recorded for tonight, it presents the check-in sheet in gate mode
 * (non-dismissible, no close/skip) over whatever is on screen and keeps it
 * on top: anything a URL deep link or push manages to present above it is
 * parked and the question is brought back. It re-checks on every foreground
 * and re-arms itself at the 5 AM reset, so the question comes back the next
 * night — and only then.
 *
 * While the answer is still unknown (cold start) it covers the tabs so the
 * app is never usable before the question has been asked.
 */
export function NightStatusGate() {
  const { session, onboardingNeeded } = useSession();
  const queryClient = useQueryClient();
  const rootState = useRootNavigationState();
  const navReady = !!rootState?.key;
  const { data, isError } = useOwnNightStatus();
  const gateState = useNightGateState();
  const lastNavRef = useRef(0);
  const gated = !!session && !onboardingNeeded;

  // Resolve the gate state from the query
  useEffect(() => {
    if (!gated) {
      setNightGateState('unknown');
      return;
    }
    if (isError) {
      // Offline / query failure: fail open rather than lock the user out
      setNightGateState('answered');
      return;
    }
    if (!data) {
      // New user id (fresh query key) or first load — not known yet
      setNightGateState('unknown');
      return;
    }
    setNightGateState(data.status ? 'answered' : 'open');
  }, [gated, data, isError]);

  // Fail open if "unknown" drags on (query paused offline, never resolving)
  useEffect(() => {
    if (!gated || gateState !== 'unknown') return;
    const timer = setTimeout(() => {
      console.warn('[NightGate] status query did not resolve in time — failing open');
      setNightGateState('answered');
    }, UNKNOWN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [gated, gateState]);

  // Keep the question on top while it is open. Runs on every root
  // navigation state change so a deep link that lands above the sheet is
  // displaced (and parked for replay) instead of bypassing it.
  useEffect(() => {
    if (gateState !== 'open' || !navReady) return;
    const routes = rootState.routes;
    const top = routes[routes.length - 1];
    if (top && ALLOWED_ABOVE_GATE.has(top.name)) return;
    if (Date.now() - lastNavRef.current < NAV_IN_FLIGHT_MS) return;
    lastNavRef.current = Date.now();

    const alreadyPresented = routes.some((r) => r.name === 'check-in');
    if (!alreadyPresented) {
      router.push(GATE_HREF);
      return;
    }
    // Something was pushed above the pending question. Remember where the
    // user was headed, then bring the question back to the top.
    if (top && top.name !== '(tabs)') {
      deferDeepLink({
        pathname: `/${top.name}`,
        params: (top.params ?? {}) as Record<string, string>,
      } as Href);
    }
    router.dismissTo(GATE_HREF);
  }, [gateState, navReady, rootState]);

  // Replay a deep link that arrived while the question was pending
  useEffect(() => {
    if (gateState !== 'answered') return;
    const href = takePendingDeepLink();
    if (!href) return;
    const timer = setTimeout(() => router.push(href), REPLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [gateState]);

  // Re-arm at the nightly reset while the app stays open
  useEffect(() => {
    if (!data) return;
    const target = data.status
      ? new Date(data.status.expires_at).getTime()
      : nightResetAt(new Date(), data.city).getTime();
    const delay = Math.min(Math.max(target - Date.now(), 1_000) + 500, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => invalidateNightStatusQueries(queryClient), delay);
    return () => clearTimeout(timer);
  }, [data, queryClient]);

  // Cover the app until we know whether to ask — never usable before the question
  if (gated && gateState === 'unknown') {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: '#110a24' }]}
        className="items-center justify-center"
        accessibilityLabel="Loading"
      >
        <ActivityIndicator color="#d4ff00" />
      </View>
    );
  }
  return null;
}
