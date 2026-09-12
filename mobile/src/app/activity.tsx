import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQueryClient } from '@tanstack/react-query';
import { openFriendCard } from '@/lib/friend-card';
import { acceptMeetUp } from '@/lib/meet-up';
import { useNotifications, type AppNotification } from '@/hooks/use-notifications';
import { useSession } from '@/hooks/use-session';
import { getTimeAgo } from '@/hooks/use-feed';
import { Avatar } from '@/components/avatar';

const NEON = '#d4ff00';

function iconForType(type: string): SFSymbol {
  if (type.includes('like')) return 'heart.fill';
  if (type.includes('comment')) return 'bubble.right.fill';
  if (type.includes('friend')) return 'person.badge.plus';
  if (type.includes('meet')) return 'mappin.and.ellipse';
  return 'bell.fill';
}

function NotificationRow({ item }: { item: AppNotification }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [accepting, setAccepting] = useState(false);
  const isMeetUpRequest = item.type === 'meetup_request' && !!item.sender_id;

  // Friend requests are actioned on the Friends screen — take the user
  // there. Any other row with a sender opens their Friend ID card (SOW §14).
  const isFriendType = item.type.includes('friend');
  const handlePress = () => {
    if (isFriendType) {
      router.back();
      router.push('/friends');
    } else if (item.sender_id) {
      openFriendCard(item.sender_id);
    }
  };

  // Web ActivityTab parity: accepting pings the sender back and opens a DM
  const handleAcceptMeetUp = async () => {
    if (!session || !item.sender_id || accepting) return;
    setAccepting(true);
    const threadId = await acceptMeetUp(session.user.id, item.sender_id, item.id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (threadId) {
      router.back();
      setTimeout(
        () =>
          router.push({
            pathname: '/thread',
            params: {
              threadId,
              title: item.sender_name ?? 'Meet up',
              avatarUrl: item.sender_avatar_url ?? '',
            },
          }),
        250
      );
    } else {
      setAccepting(false);
    }
  };
  return (
    <Pressable
      onPress={handlePress}
      disabled={!isFriendType && !item.sender_id}
      className={`flex-row items-center gap-3 p-3 rounded-xl active:opacity-70 ${item.is_read ? '' : 'bg-white/5'}`}
    >
      {item.sender_name ? (
        <Avatar name={item.sender_name} url={item.sender_avatar_url} size="sm" />
      ) : (
        <View className="w-8 h-8 rounded-full bg-[#a855f7]/30 items-center justify-center">
          <SymbolView name={iconForType(item.type)} size={14} tintColor={NEON} />
        </View>
      )}
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-sans leading-snug">{item.message}</Text>
        <Text className="text-white/35 text-xs font-sans mt-0.5">{getTimeAgo(item.created_at)}</Text>
      </View>
      {isMeetUpRequest ? (
        <Pressable
          onPress={handleAcceptMeetUp}
          disabled={accepting}
          className="px-3.5 py-2 rounded-full active:opacity-90"
          style={{ backgroundColor: NEON, opacity: accepting ? 0.6 : 1 }}
        >
          <Text className="text-[#1a0f2e] text-xs font-sans-semibold">
            {accepting ? '...' : "I'm Down"}
          </Text>
        </Pressable>
      ) : isFriendType ? (
        <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
      ) : !item.is_read ? (
        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: NEON }} />
      ) : null}
    </Pressable>
  );
}

/** Notifications list — simplified port of the web Activity page. */
export default function ActivityScreen() {
  const { data: notifications, isLoading, markAllAsRead } = useNotifications();

  // Opening the screen clears the unread badge, like the web Activity page
  useEffect(() => {
    markAllAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="flex-1 bg-[#110a24]">
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
        <Text className="text-white text-base font-sans-semibold">Activity</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEON} />
        </View>
      ) : (
        <LegendList
          recycleItems
          data={notifications ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 12, gap: 4 }}
          ListEmptyComponent={
            <View className="items-center py-16 gap-3">
              <SymbolView name="bell" size={32} tintColor="rgba(255,255,255,0.2)" />
              <Text className="text-white/40 text-sm font-sans">Nothing yet — go make some noise.</Text>
            </View>
          }
          renderItem={({ item }) => <NotificationRow item={item} />}
        />
      )}
    </View>
  );
}
