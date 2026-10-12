import { AppState } from 'react-native';
import { useCallback, useSyncExternalStore } from 'react';
import { isNightModeOpen } from './tonight';

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let foreground: ReturnType<typeof AppState.addEventListener> | undefined;
function tick() { now = Date.now(); for (const listener of listeners) listener(); }
function schedule() {
  timer = setTimeout(() => { tick(); schedule(); }, 60_000 - Date.now() % 60_000 + 20);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick(); schedule();
    foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { clearTimeout(timer); tick(); schedule(); }
    });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearTimeout(timer); foreground?.remove(); foreground = undefined; }
  };
}
export function useClockNight(city: string): boolean {
  return useSyncExternalStore(subscribe, useCallback(() => isNightModeOpen(new Date(now), city), [city]));
}
export function useClockMinute(): number {
  return useSyncExternalStore(subscribe, () => Math.floor(now / 60_000) * 60_000);
}
