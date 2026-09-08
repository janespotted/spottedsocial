import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useNotifications, type AppNotification } from '@/hooks/use-notifications';
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
  return (
    <View
      className={`flex-row items-center gap-3 p-3 rounded-xl ${item.is_read ? '' : 'bg-white/5'}`}
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
      {!item.is_read ? <View className="w-2 h-2 rounded-full" style={{ backgroundColor: NEON }} /> : null}
    </View>
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
