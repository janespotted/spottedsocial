import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { onNightBoundary } from '@/lib/night-boundary';
import { createResilientChannel } from '@/lib/resilient-channel';
import { parseInvitePointer, type DmMessage } from '@/lib/dm';
import { fetchInvites, respondToInvite, type Invite } from '@/lib/dm-invites';
import { showToast } from '@/lib/toast';

/**
 * The invites behind a thread's `[invite:<id>]` / `[meetup:<id>]` cards, kept
 * live: an Accept / Decline from the other phone, or from Activity, lands
 * through realtime on `invites` (RLS: only the two people), and so does a
 * withdraw or cancel. An id with no readable row maps to null, and the
 * card says the invite is no longer available. That covers withdrawn,
 * expired, blocked, or a pointer whose row doesn't point back at this message.
 * Same shape as the thread's shared-post loader.
 */
export function useThreadInvites(threadId: string | undefined, messages: DmMessage[]) {
  const [invites, setInvites] = useState<Map<string, Invite | null>>(new Map());
  const [responding, setResponding] = useState<Set<string>>(new Set());

  // invite id → the message that carries it; a row must match both
  const pointers = new Map<string, string>();
  for (const m of messages) {
    const id = parseInvitePointer(m.text)?.id;
    if (id && !m.id.startsWith('optimistic')) pointers.set(id, m.id);
  }
  const key = [...pointers.entries()].map(([id, msg]) => `${id}:${msg}`).sort().join(',');
  const keyRef = useRef(key);
  keyRef.current = key;

  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const entries = keyRef.current ? keyRef.current.split(',').map((e) => e.split(':') as [string, string]) : [];
    if (entries.length === 0) {
      setInvites(new Map());
      return;
    }
    try {
      const rows = await fetchInvites(entries.map(([id]) => id));
      if (request !== generation.current) return;
      const next = new Map<string, Invite | null>(entries.map(([id]) => [id, null]));
      for (const row of rows) {
        const messageId = entries.find(([id]) => id === row.id)?.[1];
        if (messageId === row.message_id && row.thread_id === threadId) next.set(row.id, row);
      }
      setInvites(next);
    } catch {
      // Keep what is on screen; the next focus / realtime event retries.
    }
  }, [threadId]);

  // New pointers (a live arrival, a fetch) load their rows
  useEffect(() => {
    void refresh();
  }, [key, refresh]);

  // Re-read on focus: an answer given from Activity while this was covered
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!threadId) return;
    const teardown = createResilientChannel({
      name: `thread-invites-${threadId}`,
      onReconnect: () => void refresh(),
      configure: (ch) =>
        ch.on(
          'postgres_changes',
          // Re-read rather than patch from the payload: a read started
          // after the change can't be overtaken by an older one in flight.
          { event: '*', schema: 'public', table: 'invites', filter: `thread_id=eq.${threadId}` },
          () => void refresh()
        ),
    });
    const boundary = onNightBoundary(() => {
      ++generation.current;
      setInvites(new Map());
    });
    return () => {
      teardown();
      boundary();
    };
  }, [threadId, refresh]);

  /** Accept / Decline from the card: optimistic, rolled back on failure. */
  const respond = useCallback(
    async (inviteId: string, accept: boolean) => {
      const before = invites.get(inviteId);
      if (!before || before.status !== 'pending' || responding.has(inviteId)) return;
      setResponding((prev) => new Set(prev).add(inviteId));
      ++generation.current;
      setInvites((prev) => new Map(prev).set(inviteId, { ...before, status: accept ? 'accepted' : 'declined' }));
      try {
        const saved = await respondToInvite(inviteId, accept);
        setInvites((prev) => new Map(prev).set(inviteId, { ...before, ...saved }));
      } catch {
        setInvites((prev) => new Map(prev).set(inviteId, before));
        showToast('This invite is no longer available');
      } finally {
        // The optimistic write cancelled any read in flight; settle on the server's view
        void refresh();
        setResponding((prev) => {
          const next = new Set(prev);
          next.delete(inviteId);
          return next;
        });
      }
    },
    [invites, responding, refresh]
  );

  return { invites, responding, respond };
}
