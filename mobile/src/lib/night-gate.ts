import { useSyncExternalStore } from 'react';
import type { Href } from 'expo-router';

/**
 * Tiny shared store for the opening "Are you out tonight?" gate.
 *
 * - `unknown`  — signed-out, onboarding, or the status query hasn't resolved
 * - `open`     — the user has not answered for tonight; the sheet is (being)
 *                presented and the app underneath must not be navigated
 * - `answered` — a Yes / TBD / No row exists for tonight
 *
 * Deep links (push taps, URL opens) that arrive while the gate is not
 * `answered` are parked here and replayed once it is, so a notification or
 * link can never route around the question.
 */
export type NightGateState = 'unknown' | 'open' | 'answered';

let state: NightGateState = 'unknown';
let pendingDeepLink: Href | null = null;
const listeners = new Set<() => void>();

export function getNightGateState(): NightGateState {
  return state;
}

export function setNightGateState(next: NightGateState): void {
  if (state === next) return;
  state = next;
  for (const l of listeners) l();
}

/**
 * Called by the check-in sheet the moment a Yes / TBD / No write succeeds,
 * BEFORE it dismisses itself. The gate would otherwise see the sheet leave
 * the top of the stack while still believing the question is open and
 * present it again; the status refetch confirms the answer moments later.
 */
export function markNightAnswered(): void {
  setNightGateState('answered');
}

export function subscribeNightGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNightGateState(): NightGateState {
  return useSyncExternalStore(subscribeNightGate, getNightGateState, getNightGateState);
}

/** Park a destination until the gate is answered (last one wins). */
export function deferDeepLink(href: Href): void {
  pendingDeepLink = href;
}

export function takePendingDeepLink(): Href | null {
  const href = pendingDeepLink;
  pendingDeepLink = null;
  return href;
}
