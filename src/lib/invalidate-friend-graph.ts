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
}
