import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

// RN has no window focus events, so refetchOnWindowFocus is a silent no-op
// until focusManager is driven from AppState (web useVisibilityRefresh parity).
AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});

// Likewise onlineManager: without NetInfo, queries fired while offline are
// paused forever instead of retrying when connectivity returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

/** Shared instance so non-hook code (e.g. moderation actions) can invalidate. */
export const queryClient = new QueryClient();
