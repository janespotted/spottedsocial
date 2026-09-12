import { useCallback } from 'react';
import { useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Native tab bar visibility (SDK 57 native tabs have no per-screen
 * hidesBottomBarWhenPushed — the documented pattern is toggling NativeTabs'
 * `hidden` prop from the focused screen; there is also no tab-bar-height
 * hook, so bottom-anchored composers hide the bar instead of padding).
 */
let hidden = false;
const listeners = new Set<() => void>();

export function setTabBarHidden(value: boolean): void {
  if (hidden === value) return;
  hidden = value;
  listeners.forEach((listener) => listener());
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => hidden
  );
}

/** Hide the tab bar while this screen is focused (chat threads etc.). */
export function useHideTabBar(): void {
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [])
  );
}
