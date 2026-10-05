import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { createDmThread } from '@/lib/dm';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

const MAX_ROWS = 8;

interface FriendOption {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_demo: boolean;
  venue_name: string | null;
}

/**
 * New chat friend picker — native form sheet. Port of the web NewChatDialog
 * (1:1). Searchable by name or @username, with the list capped like the tag
 * picker: someone with 50+ friends searches instead of scrolling.
 */
export default function NewChatSheet() {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const [creating, setCreating] = useState<string | null>(null);
  const [term, setTerm] = useState('');

  const { data: friends } = useQuery({
    queryKey: ['new-chat-friends', session?.user.id, friendIds ?? []],
    enabled: !!session && friendIds !== undefined,
    queryFn: async (): Promise<FriendOption[]> => {
      const ids = friendIds ?? [];
      if (ids.length === 0) return [];
      const [profiles, { data: statuses }] = await Promise.all([
        fetchProfilesSafe(),
        supabase
          .from('night_statuses')
          .select('user_id, venue_name')
          .in('user_id', ids)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString()),
      ]);
      const venueByUser = new Map((statuses ?? []).map((s) => [s.user_id, s.venue_name]));
      return profiles
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          id: p.id,
          display_name: p.display_name,
          username: p.username ?? null,
          avatar_url: p.avatar_url,
          is_demo: p.is_demo,
          venue_name: venueByUser.get(p.id) ?? null,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });

  const matches = useMemo(() => {
    const q = term.trim().replace(/^@/, '').toLowerCase();
    if (!q) return friends ?? [];
    return (friends ?? []).filter(
      (f) => f.display_name.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q)
    );
  }, [friends, term]);
  // Enough to scan without outgrowing the sheet; search finds the rest.
  const visible = matches.slice(0, MAX_ROWS);
  const hiddenCount = matches.length - visible.length;

  const startChat = async (friend: FriendOption) => {
    if (creating) return;
    setCreating(friend.id);
    try {
      let threadId: string | null = null;
      // Demo users have no auth rows — find their seeded thread instead
      if (friend.is_demo && isDemoMode() && session) {
        const [{ data: theirThreads }, { data: myThreads }] = await Promise.all([
          supabase.from('dm_thread_members').select('thread_id').eq('user_id', friend.id),
          supabase.from('dm_thread_members').select('thread_id').eq('user_id', session.user.id),
        ]);
        const mine = new Set((myThreads ?? []).map((m) => m.thread_id));
        threadId =
          (theirThreads ?? []).find((m) => mine.has(m.thread_id))?.thread_id ?? null;
        if (!threadId) {
          Alert.alert('Demo user', 'This demo user has no seeded conversation.');
          return;
        }
      } else {
        threadId = await createDmThread(friend.id);
      }
      router.back();
      const id = threadId;
      setTimeout(() => {
        router.push({
          pathname: '/thread',
          params: {
            threadId: id,
            title: friend.display_name,
            avatarUrl: friend.avatar_url ?? '',
          },
        });
      }, 350);
    } catch {
      Alert.alert('Failed to open chat', 'Try again.');
    } finally {
      setCreating(null);
    }
  };

  return (
    <View className="pt-6 pb-safe-offset-4 gap-3">
      <Text className="text-white text-lg font-sans-semibold px-5">New Chat</Text>

      {friends && friends.length > 0 ? (
        <View className="px-5">
          <View className="flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-3">
            <SymbolView name="magnifyingglass" size={14} tintColor="rgba(255,255,255,0.4)" />
            <TextInput
              value={term}
              onChangeText={setTerm}
              placeholder="Search friends"
              placeholderTextColorClassName="accent-white/30"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search friends"
              className="flex-1 h-10 py-0 text-white text-[15px] font-sans"
            />
            {term ? (
              <Pressable onPress={() => setTerm('')} hitSlop={8} accessibilityLabel="Clear search">
                <SymbolView name="xmark.circle.fill" size={15} tintColor="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* A plain View, NOT a ScrollView: under fitToContents the sheet
          measures its content, and a nested scroller breaks that (the venue
          sheet's trap). The list is capped instead, and search narrows it. */}
      <View className="px-5">
        {!friends ? (
          <View className="items-center py-10">
            <ActivityIndicator color={NEON} />
          </View>
        ) : friends.length === 0 ? (
          <Text className="text-white/55 text-sm font-sans py-6 text-center">
            Add friends to start chatting.
          </Text>
        ) : matches.length === 0 ? (
          <Text className="text-white/55 text-sm font-sans py-6 text-center">
            No friends match that.
          </Text>
        ) : (
          visible.map((friend) => (
            <Pressable
              key={friend.id}
              onPress={() => startChat(friend)}
              disabled={!!creating}
              className="flex-row items-center gap-3 py-2.5 active:opacity-70"
            >
              <Avatar name={friend.display_name} url={friend.avatar_url} size="md" />
              <View className="flex-1 min-w-0">
                <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                  {friend.display_name}
                </Text>
                {friend.venue_name ? (
                  <Text className="text-[#d4ff00] text-xs font-sans-medium" numberOfLines={1}>
                    @ {friend.venue_name}
                  </Text>
                ) : friend.username ? (
                  <Text className="text-white/45 text-xs font-sans" numberOfLines={1}>
                    @{friend.username}
                  </Text>
                ) : null}
              </View>
              {creating === friend.id ? (
                <ActivityIndicator size="small" color={NEON} />
              ) : (
                <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.4)" />
              )}
            </Pressable>
          ))
        )}
      </View>

      {hiddenCount > 0 ? (
        <Text className="text-white/45 text-xs font-sans px-5">
          {hiddenCount} more — search to narrow the list.
        </Text>
      ) : null}
    </View>
  );
}
