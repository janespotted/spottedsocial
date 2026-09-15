import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

type ChannelConfigurator = (channel: RealtimeChannel) => RealtimeChannel;

interface ResilientChannelOptions {
  /** Channel name — a unique per-instance suffix is appended automatically. */
  name: string;
  /** Add .on() handlers to the channel before subscribe */
  configure: ChannelConfigurator;
  /**
   * Called after a successful RE-subscribe and on app foreground so the
   * caller can refetch data missed while disconnected. Not called on the
   * initial subscribe (mount-time fetches already cover it).
   */
  onReconnect?: () => void;
  /** Called on every subscribe status callback — useful for debugging channel health */
  onStatus?: (status: string, err?: Error) => void;
}

// supabase.channel() returns the existing instance for a repeated topic, and
// .on() on an already-subscribed channel throws — so every instance gets a
// unique topic and callers never need Math.random() suffixes.
//
// The topic must ALSO be unique per subscribe attempt: removeChannel() is
// async and the old channel stays in the client's list until its leave is
// acked. Reusing the topic on retry handed back that dying instance, stacked
// another close/error callback on it, and every CLOSED then scheduled N more
// retries — an unbounded resubscribe loop after any transport drop.
let topicCounter = 0;

/**
 * Port of the web src/lib/resilient-channel.ts: a Supabase realtime channel
 * with automatic backoff resubscription on CHANNEL_ERROR / TIMED_OUT /
 * CLOSED, plus an AppState foreground listener that fires any pending retry
 * immediately (iOS freezes JS timers in the background) and invokes
 * onReconnect so callers refetch what they missed.
 *
 * Returns a cleanup function that tears down the channel, timers, and
 * foreground listener. Call it on unmount.
 */
export function createResilientChannel(opts: ResilientChannelOptions): () => void {
  const { configure, onReconnect, onStatus } = opts;
  const baseTopic = `${opts.name}-r${++topicCounter}`;

  let channel: RealtimeChannel | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let generation = 0;
  let destroyed = false;
  let everSubscribed = false;

  const backoff = () => Math.min(1000 * Math.pow(2, attempt), 30000);

  function subscribe() {
    if (destroyed) return;

    if (channel) {
      // Fire-and-forget: the leave is acked asynchronously, which is exactly
      // why the replacement below must not share this channel's topic.
      void supabase.removeChannel(channel);
      channel = null;
    }

    const topic = `${baseTopic}-s${++generation}`;
    const ch = configure(supabase.channel(topic));
    channel = ch;

    ch.subscribe((status, err) => {
      // Status callbacks from a channel we've already replaced (its deferred
      // CLOSED after removeChannel) must not drive the current one.
      if (destroyed || ch !== channel) return;

      onStatus?.(status, err as Error | undefined);

      if (status === 'SUBSCRIBED') {
        attempt = 0;
        if (everSubscribed) onReconnect?.();
        everSubscribed = true;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(`[realtime] ${topic}: ${status}`, err?.message ?? '');
        scheduleRetry();
      }
    });
  }

  function scheduleRetry() {
    if (destroyed || retryTimeout) return;
    const delay = backoff();
    attempt++;
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      subscribe();
    }, delay);
  }

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (destroyed || state !== 'active') return;
    // A backoff retry scheduled while backgrounded never ran — fire it now.
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
      subscribe();
    }
    onReconnect?.();
  });

  subscribe();

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
    appStateSub.remove();
  };
}
