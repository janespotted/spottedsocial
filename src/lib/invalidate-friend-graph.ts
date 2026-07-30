import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidates all friend-graph-related caches so that block, remove,
 * accept, and demo-clear operations propagate immediately.
 */
export function invalidateFriendGraph(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
  queryClient.invalidateQueries({ queryKey: ['mutual-friend-ids'] });
  queryClient.invalidateQueries({ queryKey: ['profiles-safe'] });
  queryClient.invalidateQueries({ queryKey: ['friends-out-status'] });

  // Notify non-react-query surfaces (e.g. Map pins) that the friend graph changed
  window.dispatchEvent(new CustomEvent('friendGraphChanged'));
}
