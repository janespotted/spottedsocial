import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { QueryClient } from '@tanstack/react-query';
import { forgetPrivateMediaLinks } from './private-media';
import { invalidatePrivateViews } from './private-views';
import { createResilientChannel } from './resilient-channel';

/**
 * Instant revocation. When a relationship narrows — unfriend, declined or
 * cancelled request, block, close-friend removal — the database writes a
 * `relationship_events` row for BOTH people (migration 20261001120000), and
 * Realtime delivers it to the signed-in user (RLS: own rows only). Screens
 * drop the other person's content immediately: the feed filters their posts,
 * an open reel of theirs closes, and every private query refetches under
 * the new RLS. This replaces polling private views every 15 seconds.
 */
type RelationshipListener = (otherUserId: string) => void;
const listeners = new Set<RelationshipListener>();

export function onRelationshipChanged(listener: RelationshipListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeRelationshipEvents(userId: string, queryClient: QueryClient): () => void {
  const redact = () => { forgetPrivateMediaLinks(); invalidatePrivateViews(queryClient); };
  let wasOffline = false;
  const network = NetInfo.addEventListener(state => {
    const offline = state.isConnected === false || state.isInternetReachable === false;
    if (offline && !wasOffline) redact();
    if (!offline && wasOffline) redact();
    wasOffline = offline;
  });
  const foreground = AppState.addEventListener('change', state => { if (state === 'active') redact(); });
  const stop = createResilientChannel({
    name: 'relationship-events',
    // Events missed while disconnected: re-read everything under current RLS.
    onReconnect: redact,
    configure: (ch) =>
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'relationship_events', filter: `user_id=eq.${userId}` },
        (payload) => {
          const event = payload.new as { other_user_id?: string; kind?: string } | null;
          const other = event?.other_user_id;
          if (!other) return;
          if (event?.kind === 'location_changed') {
            // Drop cached GPS/recap data and cancel in-flight reads immediately.
            // Location hiding does not revoke otherwise valid post sharing.
            invalidatePrivateViews(queryClient);
            return;
          }
          forgetPrivateMediaLinks();
          // Screens first (an open reel closes before the feed drops its row),
          // then the queries.
          for (const listener of [...listeners]) listener(other);
          invalidatePrivateViews(queryClient);
        }
      ),
  });
  return () => { stop(); network(); foreground.remove(); };
}
