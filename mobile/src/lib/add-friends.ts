import { router } from 'expo-router';
import type { EmptyAction } from '@/components/empty-state';

/**
 * The two ways to grow a friend graph, offered from every empty list
 * (client feedback §8): match contacts, or send an invite link.
 */
export function addFriendsActions(): EmptyAction[] {
  return [
    { label: 'Add friends', icon: 'person.badge.plus', primary: true, onPress: () => router.push('/contacts-sync') },
    { label: 'Invite friends', icon: 'paperplane', onPress: () => router.push('/invite-friends') },
  ];
}
