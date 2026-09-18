import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
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

interface FriendOption {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_demo: boolean;
  venue_name: string | null;
}

/** New chat friend picker — native form sheet. Port of the web NewChatDialog (1:1). */
export default function NewChatSheet() {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const [creating, setCreating] = useState<string | null>(null);

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
          avatar_url: p.avatar_url,
          is_demo: p.is_demo,
          venue_name: venueByUser.get(p.id) ?? null,
        }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });

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
    <View className="pt-6 pb-4" style={{ maxHeight: 560 }}>
      <Text className="text-white text-lg font-sans-semibold px-5 mb-4">New Chat</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {(friends ?? []).map((friend) => (
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
              ) : null}
            </View>
            <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.4)" />
          </Pressable>
        ))}
        {friends && friends.length === 0 ? (
          <Text className="text-white/50 text-sm font-sans py-6 text-center">
            Add friends to start chatting.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
