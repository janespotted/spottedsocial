import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Demo content requires a trusted server capability and an explicit local
 * preference. A saved switch or build-time environment variable grants no access.
 * Lahore venues are real, city-scoped data; synthetic people remain demo data. */

const STORAGE_KEY = 'spotted.demoMode';

let enabled = false;
let authorized = false;
export function setDemoAuthorization(value: boolean): void { authorized = value; emit(); }
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
  if (!authorized) return;
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
  return authorized && enabled;
}

export function useDemoMode(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => authorized && enabled
  );
}
