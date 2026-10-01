import type { QueryClient } from '@tanstack/react-query';

export const PRIVATE_VIEW_KEYS = [
  'morning-after', 'edit-plan', 'venue-events', 'friend-requests-count', 'plan-friends', 'blocked-hidden', 'friend-ids', 'friends-out', 'map-data', 'friend-card', 'profile-page', 'friends',
  'mutual-friends-with', 'audience-counts', 'plan-close-friends', 'friends-page',
  'planning-friends', 'close-friend-ids', 'plans', 'plan-events', 'plan-downs',
  'plan-participants', 'plan-comments', 'notifications', 'activity', 'dm-threads',
  'comments', 'comments-post-exists', 'post-likes', 'post-detail', 'venue-card',
  'party-details', 'party-guests', 'share-friends', 'share-post-friends', 'tag-friends', 'leaderboard',
] as const;
let revision = 0;
export const privateViewRevision = () => revision;
const listeners = new Set<() => void>();
export function onPrivateViewsInvalidated(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Cancel old reads before redacting. Active queries re-fetch under current server authorization. */
export function invalidatePrivateViews(queryClient: QueryClient): void {
  ++revision;
  for (const key of PRIVATE_VIEW_KEYS) {
    void queryClient.cancelQueries({ queryKey: [key] });
    void queryClient.resetQueries({ queryKey: [key] });
  }
  for (const listener of [...listeners]) listener();
}
