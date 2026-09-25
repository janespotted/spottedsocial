import { getSessionUserId, getSessionRevision } from './session-identity';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

/**
 * The three audience tiers, in order of breadth. Same names, definitions and
 * selection pattern for live statuses (check-in / TBD) and posts — but the
 * two preferences are stored separately (status → profiles.location_sharing_level,
 * posts → device storage) so changing one never touches the other.
 */
export type Audience = 'close_friends' | 'all_friends' | 'mutual_friends';

export const DEFAULT_AUDIENCE: Audience = 'all_friends';

export const AUDIENCE_OPTIONS: ReadonlyArray<{ value: Audience; label: string; desc: string }> = [
  { value: 'close_friends', label: 'Close Friends', desc: 'Only friends on your Close Friends list.' },
  { value: 'all_friends', label: 'Friends', desc: 'All your friends on Spotted, including Close Friends.' },
  {
    value: 'mutual_friends',
    label: 'Friends + Mutuals',
    desc: 'Your friends and people you share a friend with on Spotted.',
  },
];

export function isAudience(value: unknown): value is Audience {
  return AUDIENCE_OPTIONS.some((o) => o.value === value);
}

export function audienceLabel(value: string | null | undefined): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? 'Friends';
}

/* ── Picker request: the /audience form sheet is a separate screen, so the
      caller's current value and confirm handler cross the boundary here. ── */

export interface AudienceRequest {
  value: Audience;
  /** Status audiences warn on empty tiers; post audiences do the same. Kept for copy. */
  context: 'status' | 'post';
  live?: boolean;
  onConfirm: (value: Audience) => void | Promise<void>;
}

let request: AudienceRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Open "Who can see this?" over the current screen. Confirming calls back; it never publishes. */
export function openAudiencePicker(req: AudienceRequest): void {
  request = req;
  emit();
  router.push('/audience');
}

export function clearAudienceRequest(): void {
  request = null;
  emit();
}

export function useAudienceRequest(): AudienceRequest | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => request,
    () => request
  );
}

/* ── Post audience preference (per account; separate from the status one) ── */

const POST_AUDIENCE_KEY = 'spotted.post-audience';

export async function loadPostAudience(): Promise<Audience> {
  try {
    const revision = getSessionRevision();
    const raw = await AsyncStorage.getItem(`${POST_AUDIENCE_KEY}:${getSessionUserId() ?? 'signed-out'}`);
    if (revision !== getSessionRevision()) return DEFAULT_AUDIENCE;
    return isAudience(raw) ? raw : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

export async function savePostAudience(value: Audience): Promise<void> {
  try {
    await AsyncStorage.setItem(`${POST_AUDIENCE_KEY}:${getSessionUserId() ?? 'signed-out'}`, value);
  } catch {
    /* best effort */
  }
}
