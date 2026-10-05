import { supabase } from './supabase';

/**
 * Day Mode / Night Mode (mobile/DAY-NIGHT-MODE-PLAN.md). The schedule itself
 * is computed on the device by lib/tonight.ts (`nightModeOpensAt`), the same
 * way the 5 AM reset is. The server adds one thing the clock cannot know: a
 * tester account's Day/Night override, which the server also honours for its
 * guards (`spotted_private.night_mode_blocks`), so a forced Night at noon can
 * really send a Meet Up and a forced Day at 9 PM really refuses one.
 */
export type NightModeKind = 'day' | 'night';

export interface NightModeServerState {
  /** Tester accounts only (spotted_private.night_mode_testers, added by SQL). */
  tester: boolean;
  override: NightModeKind | null;
  /** Whether the server refuses Night-only actions outside the schedule yet. */
  enforced: boolean;
}

export const NIGHT_MODE_KEY = 'night-mode';

/**
 * The override, or null when it cannot be read (offline, or a database that
 * predates migration 20261006100000) — the clock alone then decides.
 */
export async function fetchNightModeServerState(): Promise<NightModeServerState | null> {
  const { data, error } = await supabase.rpc('get_night_mode');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as { tester?: boolean; override?: string | null; enforced?: boolean };
  return {
    tester: !!row.tester,
    override: row.override === 'day' || row.override === 'night' ? row.override : null,
    enforced: !!row.enforced,
  };
}

/** Testers only: 'auto' follows the schedule again. */
export async function setNightModeOverride(mode: NightModeKind | 'auto'): Promise<NightModeServerState> {
  const { error } = await supabase.rpc('set_night_mode_override', { p_mode: mode });
  if (error) throw error;
  const state = await fetchNightModeServerState();
  if (!state) throw new Error('Could not read the mode back');
  return state;
}

/** A refusal from a Night-only RPC ("Meet ups open when Night Mode starts at 6 PM."). */
export function isNightModeClosedError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { hint?: string }).hint === 'night_mode_closed';
}
