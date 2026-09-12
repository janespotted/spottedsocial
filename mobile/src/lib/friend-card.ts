import { router } from 'expo-router';

/**
 * SOW §14: tapping a name/avatar ANYWHERE opens the Friend ID card. This is
 * the one entry point every surface calls — a native form sheet, so it
 * stacks above modals (comments, likes) where a Dialog portal cannot.
 * No-ops for your own id (the app has no self ID card; Profile tab is self).
 */
export function openFriendCard(userId: string, currentUserId?: string): void {
  if (!userId || userId === currentUserId) return;
  router.push({ pathname: '/friend-card' as never, params: { userId } });
}
