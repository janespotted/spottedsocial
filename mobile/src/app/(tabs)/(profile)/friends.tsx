import { invalidateFriendGraph, setCloseFriend } from '@/lib/friend-relationship';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { Alert } from 'react-native';
import { useState } from 'react';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { ActionSheetIOS, ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { LegendList } from '@legendapp/list/react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { fetchPeopleYouMayKnow, sendFriendRequest, type SuggestedFriend } from '@/lib/friends';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { AddFriendsRow, EmptyState, ErrorState } from '@/components/empty-state';
import { NEON } from '@/lib/theme';

interface FriendRow {
  kind: 'request' | 'friend' | 'header' | 'suggestion';
  key: string;
  title?: string;
  requestId?: string;
  userId?: string;
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
  isClose?: boolean;
  mutualCount?: number;
}

interface FriendsData {
  rows: FriendRow[];
}

async function fetchFriendsData(userId: string): Promise<FriendsData> {
  const [profiles, incomingRes, sentRes, receivedRes, closeRes, suggestions] = await Promise.all([
    fetchProfilesSafe(),
    supabase
      .from('friendships')
      .select('id, user_id')
      .eq('friend_id', userId)
      .eq('status', 'pending'),
    supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
    supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
    supabase.from('close_friends').select('close_friend_id').eq('user_id', userId),
    fetchPeopleYouMayKnow(userId),
  ]);

  for (const response of [incomingRes, sentRes, receivedRes, closeRes]) {
    if (response.error) throw response.error;
  }
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

  // People you may know — exclude anyone already a friend or requester
  const excluded = new Set([...friendIds, ...requests.map((r) => r.user_id), userId]);
  const visibleSuggestions = suggestions.filter((s: SuggestedFriend) => !excluded.has(s.id));
  if (visibleSuggestions.length > 0) {
    rows.push({ kind: 'header', key: 'h-suggestions', title: 'People You May Know' });
    for (const s of visibleSuggestions) {
      rows.push({
        kind: 'suggestion',
        key: `sug-${s.id}`,
        userId: s.id,
        display_name: s.display_name,
        username: s.username,
        avatar_url: s.avatar_url,
        mutualCount: s.mutual_count,
      });
    }
  }

  const friends = friendIds
    .map((id) => profileMap.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  rows.push({ kind: 'header', key: 'h-friends', title: `Friends (${friends.length})` });
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
  // pb-32 clears the native tab bar + home indicator (see settings.tsx)
  const contentContainerStyle = useResolveClassNames('px-4 pb-32');
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const { data, refetch, isRefetching, isLoading, isError } = useQuery({
    queryKey: ['friends-page', userId],
    enabled: !!session,
    queryFn: () => fetchFriendsData(userId!),
  });
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const hasFriends = (data?.rows ?? []).some((r) => r.kind === 'friend');

  const invalidate = () => invalidateFriendGraph(queryClient);

  const acceptRequest = async (row: FriendRow) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', row.requestId!);
    if (error) { Alert.alert('Could not accept request', 'Please try again.'); return; }
    invalidate();
  };

  const declineRequest = async (row: FriendRow) => {
    await supabase.from('friendships').delete().eq('id', row.requestId!);
    invalidate();
  };

  const toggleClose = async (row: FriendRow) => {
    if (!userId || !row.userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await setCloseFriend(userId, row.userId, !row.isClose); }
    catch { Alert.alert('Friend setting not saved', 'Please try again.'); return; }
    invalidate();
  };

  const addSuggested = async (row: FriendRow) => {
    if (!userId || !row.userId || requestedIds.has(row.userId)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRequestedIds((prev) => new Set(prev).add(row.userId!));
    const ok = await sendFriendRequest(userId, row.userId);
    if (!ok) {
      setRequestedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.userId!);
        return next;
      });
    }
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
        // Mixed row kinds (header/request/friend) reading requestedIds from
        // component state, with no extraData — remount on reuse.
        recycleItems={false}
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColorClassName="accent-[#d4ff00]"
          />
        }
        // Find / Invite always one tap away (client feedback §8), and a
        // hint for the star so Close Friends is manageable from here
        ListHeaderComponent={
          <View className="pt-4 gap-3">
            <AddFriendsRow />
            {hasFriends ? (
              <View className="flex-row items-center gap-1.5">
                <SymbolView name="star.fill" size={11} tintColor={NEON} />
                <Text className="text-white/60 text-xs font-sans">
                  Tap the star to add someone to Close Friends — your most private audience.
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={NEON} />
            </View>
          ) : isError ? (
            <ErrorState title="Couldn't load your friends" onRetry={() => refetch()} retrying={isRefetching} />
          ) : (
            <EmptyState
              icon="person.2"
              title="No friends yet"
              body="Find people you know from your contacts, search by username, or send an invite."
              actions={[
                { label: 'Search people', icon: 'magnifyingglass', onPress: () => router.push('/search') },
              ]}
              compact
            />
          )
        }
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            // The "Friends (0)" header is noise on an empty list
            item.key === 'h-friends' && !hasFriends ? null : (
            <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider pt-5 pb-2">
              {item.title}
            </Text>
            )
          ) : item.kind === 'request' ? (
            <View className="flex-row items-center gap-3 py-2.5">
              <Avatar name={item.display_name ?? '?'} url={item.avatar_url ?? null} size="md" />
              <View className="flex-1 min-w-0">
                <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
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
          ) : item.kind === 'suggestion' ? (
            <View className="flex-row items-center gap-3 py-2.5">
              <Avatar name={item.display_name ?? '?'} url={item.avatar_url ?? null} size="md" />
              <View className="flex-1 min-w-0">
                <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
                  {item.mutualCount && item.mutualCount > 0
                    ? `${item.mutualCount} mutual friend${item.mutualCount !== 1 ? 's' : ''}`
                    : `@${item.username}`}
                </Text>
              </View>
              <Pressable
                onPress={() => addSuggested(item)}
                disabled={requestedIds.has(item.userId ?? '')}
                className="px-4 py-2 rounded-full border border-[#a855f7]/40 active:bg-[#a855f7]/15"
              >
                <Text
                  className={`text-xs font-sans-semibold ${
                    requestedIds.has(item.userId ?? '') ? 'text-white/55' : 'text-[#a855f7]'
                  }`}
                >
                  {requestedIds.has(item.userId ?? '') ? 'Requested' : 'Add Friend'}
                </Text>
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
                <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleClose(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={item.isClose ? 'Remove from Close Friends' : 'Add to Close Friends'}
                accessibilityState={{ selected: !!item.isClose }}
                className={`flex-row items-center gap-1.5 min-h-9 rounded-full active:opacity-70 ${item.isClose ? 'pl-2.5 pr-3' : 'px-2.5'}`}
                style={
                  item.isClose
                    ? { backgroundColor: 'rgba(212,255,0,0.12)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.4)' }
                    : undefined
                }
              >
                <SymbolView
                  name={item.isClose ? 'star.fill' : 'star'}
                  size={16}
                  tintColor={item.isClose ? NEON : 'rgba(255,255,255,0.35)'}
                />
                {item.isClose ? (
                  <Text className="text-[11px] font-sans-semibold" style={{ color: NEON }}>Close</Text>
                ) : null}
              </Pressable>
            </Pressable>
          )
        }
      />
    </View>
  );
}
