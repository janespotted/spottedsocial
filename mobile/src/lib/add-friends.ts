import { router } from 'expo-router';
import type { EmptyAction } from '@/components/empty-state';

/**
 * One next step for an empty social screen. Profile sharing lives in Friends.
 */
export function addFriendsActions(): EmptyAction[] {
  return [
    { label: 'Find friends', icon: 'person.badge.plus', primary: true, onPress: () => router.push('/contacts-sync') },
  ];
}
