import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Demo-content visibility. SOW §15: demo content must never reach a real
 * user by accident — so it is OFF by default in every build, and only a
 * deliberate switch in Settings turns it on for that device.
 *
 * Why it is a runtime toggle and not `__DEV__`: the developer is
 * Lahore-based and needs the Lahore demo city on a TestFlight build to
 * exercise venue detection, arrival prompts and the map against venues
 * they can walk to, while Jane's build of the same binary keeps showing
 * NYC / LA / Palm Beach untouched.
 *
 * `EXPO_PUBLIC_DEMO_MODE=1` in mobile/.env pre-arms it for a dev client;
 * everything else starts off.
 *
 * Seed/clear demo data with the `seed-demo-data` edge function; the Lahore
 * venues are plain rows with is_demo = true (migration 20260918150000).
 */

const STORAGE_KEY = 'spotted.demoMode';

let enabled = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Read the saved preference once at launch. Call before the first screen
 * renders (root layout) so a demo session survives a restart.
 */
export async function hydrateDemoMode(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      enabled = saved === '1';
      emit();
    }
  } catch {
    /* unreadable storage — stay off */
  }
}

export async function setDemoMode(next: boolean): Promise<void> {
  enabled = next;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* best effort — the in-memory value still applies this session */
  }
}

/**
 * Non-reactive read, for query functions and other plain modules. UI that
 * must re-render when the switch flips uses `useDemoMode()`.
 */
export function isDemoMode(): boolean {
  return enabled;
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => enabled
  );
}
