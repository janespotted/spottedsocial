import { ActionSheetIOS, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';

const NEON = '#d4ff00';

interface FriendRow {
  kind: 'request' | 'friend' | 'header';
  key: string;
  title?: string;
  requestId?: string;
  userId?: string;
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
  isClose?: boolean;
}

interface FriendsData {
  rows: FriendRow[];
}

async function fetchFriendsData(userId: string): Promise<FriendsData> {
  const [profiles, incomingRes, sentRes, receivedRes, closeRes] = await Promise.all([
    fetchProfilesSafe(),
    supabase
      .from('friendships')
      .select('id, user_id')
      .eq('friend_id', userId)
      .eq('status', 'pending'),
    supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
    supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
    supabase.from('close_friends').select('close_friend_id').eq('user_id', userId),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const closeIds = new Set((closeRes.data ?? []).map((c) => c.close_friend_id));
  const friendIds = [
    ...new Set([
      ...(sentRes.data?.map((f) => f.friend_id) ?? []),
      ...(receivedRes.data?.map((f) => f.user_id) ?? []),
    ]),
  ];

  const rows: FriendRow[] = [];
  const requests = (incomingRes.data ?? []).filter((r) => profileMap.has(r.user_id));
  if (requests.length > 0) {
    rows.push({ kind: 'header', key: 'h-requests', title: `Requests (${requests.length})` });
    for (const req of requests) {
      const p = profileMap.get(req.user_id)!;
      rows.push({
        kind: 'request',
        key: `req-${req.id}`,
        requestId: req.id,
        userId: req.user_id,
        display_name: p.display_name,
        username: p.username,
        avatar_url: p.avatar_url,
      });
    }
  }

  const friends = friendIds
    .map((id) => profileMap.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  rows.push({ kind: 'header', key: 'h-friends', title: `All Friends (${friends.length})` });
  for (const p of friends) {
    rows.push({
      kind: 'friend',
      key: `friend-${p.id}`,
      userId: p.id,
      display_name: p.display_name,
      username: p.username,
      avatar_url: p.avatar_url,
      isClose: closeIds.has(p.id),
    });
  }

  return { rows };
}

/** Friends — incoming requests + all friends with close-friend stars. */
export default function FriendsScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const contentContainerStyle = useResolveClassNames('px-4 pb-10');

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['friends-page', userId],
    enabled: !!session,
    queryFn: () => fetchFriendsData(userId!),
  });

  const invalidate = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['friend-ids'] });
    queryClient.invalidateQueries({ queryKey: ['profile-page'] });
  };

  const acceptRequest = async (row: FriendRow) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', row.requestId!);
    if (!error && row.userId) {
      // Notify the requester (web parity)
      const { data: me } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId!)
        .maybeSingle();
      const myName = me?.display_name?.split(' ')[0] ?? 'Someone';
      supabase
        .rpc('create_notification', {
          p_receiver_id: row.userId,
          p_type: 'friend_accepted',
          p_message: `${myName} accepted your friend request!`,
        })
        .then(() => {});
    }
    invalidate();
  };

  const declineRequest = async (row: FriendRow) => {
    await supabase.from('friendships').delete().eq('id', row.requestId!);
    invalidate();
  };

  const toggleClose = async (row: FriendRow) => {
    if (!userId || !row.userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (row.isClose) {
      await supabase
        .from('close_friends')
        .delete()
        .eq('user_id', userId)
        .eq('close_friend_id', row.userId);
    } else {
      await supabase
        .from('close_friends')
        .insert({ user_id: userId, close_friend_id: row.userId });
    }
    invalidate();
  };

  const showFriendActions = (row: FriendRow) => {
    if (!userId || !row.userId) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: row.display_name,
        options: [
          row.isClose ? 'Remove from Close Friends' : 'Add to Close Friends',
          'Message',
          'Remove Friend',
          'Cancel',
        ],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      async (index) => {
        if (index === 0) toggleClose(row);
        if (index === 1) {
          const { createDmThread } = await import('@/lib/dm');
          try {
            const threadId = await createDmThread(row.userId!);
            router.push({
              pathname: '/thread',
              params: {
                threadId,
                title: row.display_name ?? '',
                avatarUrl: row.avatar_url ?? '',
              },
            });
          } catch {
            /* demo users can't be DM'd */
          }
        }
        if (index === 2) {
          await supabase
            .from('friendships')
            .delete()
            .or(
              `and(user_id.eq.${userId},friend_id.eq.${row.userId}),and(user_id.eq.${row.userId},friend_id.eq.${userId})`
            );
          invalidate();
        }
      }
    );
  };

  return (
    <View className="flex-1">
      {/* Header */}
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Text className="text-white font-sans-semibold text-base flex-1">Friends</Text>
      </View>

      <LegendList
        data={data?.rows ?? []}
        keyExtractor={(r) => r.key}
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColorClassName="accent-[#d4ff00]"
          />
        }
        ListEmptyComponent={
          <View className="items-center py-20 px-8">
            <Text className="text-white/50 text-sm font-sans text-center">
              No friends yet — find people from Search.
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider pt-5 pb-2">
              {item.title}
            </Text>
          ) : item.kind === 'request' ? (
            <View className="flex-row items-center gap-3 py-2.5">
              <Avatar name={item.display_name ?? '?'} url={item.avatar_url ?? null} size="md" />
              <View className="flex-1 min-w-0">
                <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text className="text-white/40 text-xs font-sans" numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
              <Pressable
                onPress={() => acceptRequest(item)}
                className="px-4 py-2 rounded-full active:opacity-90"
                style={{ backgroundColor: NEON }}
              >
                <Text className="text-[#1a0f2e] text-xs font-sans-semibold">Accept</Text>
              </Pressable>
              <Pressable
                onPress={() => declineRequest(item)}
                hitSlop={6}
                className="w-8 h-8 rounded-full items-center justify-center border border-white/15 active:bg-white/5"
              >
                <SymbolView name="xmark" size={12} tintColor="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => showFriendActions(item)}
              className="flex-row items-center gap-3 py-2.5 active:opacity-70"
            >
              <Avatar name={item.display_name ?? '?'} url={item.avatar_url ?? null} size="md" />
              <View className="flex-1 min-w-0">
                <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text className="text-white/40 text-xs font-sans" numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
              <Pressable onPress={() => toggleClose(item)} hitSlop={8} className="active:scale-125">
                <SymbolView
                  name={item.isClose ? 'star.fill' : 'star'}
                  size={18}
                  tintColor={item.isClose ? NEON : 'rgba(255,255,255,0.3)'}
                />
              </Pressable>
            </Pressable>
          )
        }
      />
    </View>
  );
}
