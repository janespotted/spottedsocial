import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DmMember } from '@/lib/dm';

/** Stop advertising typing after this long with no keystroke. */
const IDLE_MS = 4000;
/** Don't re-track on every keystroke — one network op per window is enough. */
const THROTTLE_MS = 2000;

/**
 * Typing indicators over Realtime Presence.
 *
 * Presence — not a table — because typing is ephemeral: it matters for a
 * few seconds and is garbage after that. Presence keeps it in memory, and
 * the server evicts a member the moment their socket drops, so an app that
 * is killed or backgrounded can't leave a stuck "is typing..." behind.
 *
 * This replaced a `dm_typing_indicators` table whose rows carried a
 * client-generated `updated_at` that readers compared against their OWN
 * clock. Two simulators share one host clock so it always worked in dev,
 * but on real devices and TestFlight a few seconds of NTP drift filtered
 * every row out as stale and the indicator silently never appeared.
 * Presence carries no timestamp, so there is no clock to disagree about.
 *
 * Web and mobile share this channel name and payload shape — keep them in
 * sync with src/hooks/useTypingIndicator.ts.
 *
 * Returns first names, ready to render.
 */
export function useTypingIndicator(
  threadId: string | undefined,
  userId: string | undefined,
  memberMap: Map<string, DmMember>
) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const lastTypingSentRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isTrackedRef = useRef(false);
  // Read inside the presence handler without resubscribing when it changes
  const memberMapRef = useRef(memberMap);
  memberMapRef.current = memberMap;

  useEffect(() => {
    if (!threadId || !userId) return;

    const channel = supabase.channel(`typing:${threadId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    const syncFromPresence = () => {
      const state = channel.presenceState<{ typing?: boolean }>();
      const names: string[] = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key === userId) continue;
        if (!entries.some((e) => e.typing)) continue;
        const displayName = memberMapRef.current.get(key)?.display_name ?? 'Someone';
        names.push(displayName.split(' ')[0]);
      }
      // Skip no-op updates — an empty -> empty sync would otherwise build a
      // new array every event and re-render the thread mid-keystroke.
      setTypingNames((prev) => (prev.length === 0 && names.length === 0 ? prev : names));
    };

    channel.on('presence', { event: 'sync' }, syncFromPresence).subscribe();

    // iOS suspends the socket in the background: our own presence is dropped
    // server-side, and the stale peer list we still hold is no longer true.
    // Clear it on foreground and let the next sync repopulate.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      isTrackedRef.current = false;
      lastTypingSentRef.current = 0;
      setTypingNames((prev) => (prev.length === 0 ? prev : []));
    });

    return () => {
      appStateSub.remove();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      isTrackedRef.current = false;
      lastTypingSentRef.current = 0;
      channelRef.current = null;
      // Removing the channel drops our presence — no explicit untrack needed
      supabase.removeChannel(channel);
    };
  }, [threadId, userId]);

  const setTyping = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    // Always push the idle deadline out, even inside the throttle window, so
    // continuous typing never expires mid-sentence.
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (!isTrackedRef.current) return;
      isTrackedRef.current = false;
      lastTypingSentRef.current = 0;
      channel.untrack();
    }, IDLE_MS);

    const now = Date.now();
    if (isTrackedRef.current && now - lastTypingSentRef.current < THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    isTrackedRef.current = true;
    channel.track({ typing: true });
  }, []);

  return { typingNames, setTyping };
}
