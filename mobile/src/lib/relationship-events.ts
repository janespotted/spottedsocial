import type { QueryClient } from '@tanstack/react-query';
import { forgetPrivateMediaLinks } from './private-media';
import { PRIVATE_VIEW_KEYS } from './private-views';
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

function refetchPrivateViews(queryClient: QueryClient) {
  for (const key of PRIVATE_VIEW_KEYS) void queryClient.invalidateQueries({ queryKey: [key] });
}

export function subscribeRelationshipEvents(userId: string, queryClient: QueryClient): () => void {
  return createResilientChannel({
    name: 'relationship-events',
    // Events missed while disconnected: re-read everything under current RLS.
    onReconnect: () => refetchPrivateViews(queryClient),
    configure: (ch) =>
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'relationship_events', filter: `user_id=eq.${userId}` },
        (payload) => {
          const other = (payload.new as { other_user_id?: string } | null)?.other_user_id;
          if (!other) return;
          forgetPrivateMediaLinks();
          // Screens first (an open reel closes before the feed drops its row),
          // then the queries.
          for (const listener of [...listeners]) listener(other);
          refetchPrivateViews(queryClient);
        }
      ),
  });
}
