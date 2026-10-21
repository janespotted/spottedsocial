import { RefreshControl, ScrollView, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { HomePlansPreview } from './home-plans-preview';
import { CompactRecapEntry } from './compact-recap-entry';
import { ForTonight } from './venue-recommendations';
import { EmptyState } from './empty-state';
import { useSession } from '@/hooks/use-session';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useNightMode } from '@/hooks/use-night-mode';
import { useClockMinute } from '@/lib/night-clock';
import { cityToTimezone } from '@/lib/tonight';
import { addFriendsActions } from '@/lib/add-friends';

export function DayHome() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { city } = useNightMode();
  const now = useClockMinute();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: cityToTimezone(city), hour: 'numeric', hourCycle: 'h23' }).format(now));
  const morning = hour < 12;
  const friends = useFriendIds(session?.user.id);
  const { refreshing, onRefresh } = usePullToRefresh(() => Promise.all(['plans', 'night-recap', 'friend-ids'].map(key => queryClient.invalidateQueries({ queryKey: [key] }))));
  return <ScrollView contentContainerClassName="pt-4 pb-36 gap-4" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4ff00" />}>
    {morning ? <CompactRecapEntry /> : null}
    <HomePlansPreview />
    {friends.isSuccess && friends.data.length === 0 ? <View className="px-4"><EmptyState compact icon="person.2" title="Find your people" actions={addFriendsActions()} /></View> : null}
    <ForTonight />
    {!morning ? <CompactRecapEntry /> : null}
    <Pressable accessibilityRole="button" onPress={() => router.push('/explore')} className="mx-4 min-h-11 py-3"><Text className="text-[#d4ff00] text-sm font-sans-medium">Explore more spots →</Text></Pressable>
  </ScrollView>;
}
