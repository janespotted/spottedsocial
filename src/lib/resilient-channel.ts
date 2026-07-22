import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from '@/lib/platform';
import type { RealtimeChannel } from '@supabase/supabase-js';

type ChannelConfigurator = (channel: ReturnType<typeof supabase.channel>) => ReturnType<typeof supabase.channel>;

interface ResilientChannelOptions {
  /** Unique channel name */
  name: string;
  /** Add .on() handlers to the channel before subscribe */
  configure: ChannelConfigurator;
  /** Called after a successful resubscribe (or app foreground) so the caller can refetch data missed while disconnected */
  onReconnect?: () => void;
}

/**
 * Creates a Supabase realtime channel with automatic resubscription on
 * CHANNEL_ERROR / TIMED_OUT / CLOSED, and an app-foreground listener that
 * invokes onReconnect so callers refetch data missed during the gap.
 *
 * Returns a cleanup function that tears down the channel, timers, and
 * foreground listener. Call it on unmount.
 */
export function createResilientChannel(opts: ResilientChannelOptions): () => void {
  const { name, configure, onReconnect } = opts;

  let channel: RealtimeChannel | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let destroyed = false;
  let appListenerCleanup: (() => void) | null = null;

  const backoff = () => Math.min(1000 * Math.pow(2, attempt), 30000);

  function subscribe() {
    if (destroyed) return;

    // Clean up previous channel if any
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }

    const ch = configure(supabase.channel(name));

    ch.subscribe((status, err) => {
      if (destroyed) return;

      if (status === 'SUBSCRIBED') {
        attempt = 0;
        if (channel !== null) {
          // This is a RE-subscribe, not the initial one
          onReconnect?.();
        }
        channel = ch;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(`[realtime] ${name}: ${status}`, err);
        scheduleRetry();
      }
    });

    // Set channel immediately so first-run cleanup works
    channel = ch;
  }

  function scheduleRetry() {
    if (destroyed) return;
    const delay = backoff();
    attempt++;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      subscribe();
    }, delay);
  }

  // App foreground listener — reconnect channel + refetch
  function setupForegroundListener() {
    if (isNativePlatform()) {
      let removeListener: (() => void) | null = null;

      import('@capacitor/app').then(({ App }) => {
        if (destroyed) return;
        const handle = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive && !destroyed) {
            onReconnect?.();
          }
        });
        handle.then(h => {
          if (destroyed) {
            h.remove();
          } else {
            removeListener = () => h.remove();
            appListenerCleanup = removeListener;
          }
        });
      }).catch(() => {});

      appListenerCleanup = () => {
        removeListener?.();
      };
    } else {
      // Web: refetch when tab becomes visible again (websocket may have dropped)
      const handleVisibility = () => {
        if (!destroyed && document.visibilityState === 'visible') {
          onReconnect?.();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      appListenerCleanup = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }

  // Start
  subscribe();
  setupForegroundListener();

  // Cleanup function
  return () => {
    destroyed = true;
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    appListenerCleanup?.();
  };
}
