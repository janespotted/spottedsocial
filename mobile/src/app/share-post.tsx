import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { createDmThread } from '@/lib/dm';
import { APP_BASE_URL } from '@/lib/invites';
import { fetchProfilesSafe } from '@/lib/profiles';
import { notifyDmRecipients } from '@/lib/dm';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

interface ShareFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_out: boolean;
}

/**
 * Share a post to a DM — native form sheet. Port of the web ShareToDMModal:
 * sends a `[shared_post:<id>]` message the thread renders as a post card.
 * Sharing someone else's post is limited to mutual friends of the author.
 */
export default function SharePostSheet() {
  const { postId, authorId, authorName } = useLocalSearchParams<{
    postId: string;
    authorId: string;
    authorName?: string;
  }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: friendIds } = useFriendIds(userId);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const { data: friends } = useQuery({
    queryKey: ['share-friends', userId, postId, friendIds ?? []],
    enabled: !!session && friendIds !== undefined && !!authorId,
    queryFn: async (): Promise<ShareFriend[]> => {
      const profiles = await fetchProfilesSafe();
      let eligible = new Set(friendIds ?? []);

      // Someone else's post → recipients must also be friends with the author
      const isDemoPost = profiles.find((p) => p.id === authorId)?.is_demo;
      if (authorId !== userId && !isDemoPost) {
        const [s, r] = await Promise.all([
          supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', authorId)
            .eq('status', 'accepted'),
          supabase
            .from('friendships')
            .select('user_id')
            .eq('friend_id', authorId)
            .eq('status', 'accepted'),
        ]);
        const authorFriends = new Set([
          ...(s.data?.map((f) => f.friend_id) ?? []),
          ...(r.data?.map((f) => f.user_id) ?? []),
        ]);
        eligible = new Set([...eligible].filter((id) => authorFriends.has(id)));
      }

      const { data: statuses } = await supabase
        .from('night_statuses')
        .select('user_id')
        .eq('status', 'out')
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());
      const outIds = new Set((statuses ?? []).map((s2) => s2.user_id));

      return profiles
        .filter((p) => eligible.has(p.id) && (isDemoMode() || !p.is_demo))
        .map((p) => ({
          id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          is_out: outIds.has(p.id),
        }))
        .sort((a, b) => {
          if (a.is_out !== b.is_out) return a.is_out ? -1 : 1;
          return a.display_name.localeCompare(b.display_name);
        });
    },
  });

  const send = async (friend: ShareFriend) => {
    if (!userId || !postId || sending) return;
    setSending(friend.id);
    try {
      const threadId = await createDmThread(friend.id);
      const { error } = await supabase.from('dm_messages').insert({
        thread_id: threadId,
        sender_id: userId,
        text: `[shared_post:${postId}]`,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent((prev) => new Set(prev).add(friend.id));
      const { data: me } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();
      notifyDmRecipients(userId, me?.display_name?.split(' ')[0] ?? 'Someone', [friend.id], 'Shared a post');
    } catch {
      /* demo users / offline */
    } finally {
      setSending(null);
    }
  };

  const shareExternal = () => {
    Share.share({
      message: `${authorName ?? 'A friend'} on Spotted — ${APP_BASE_URL}/post/${postId}`,
    });
  };

  return (
    <View className="pt-6 pb-8" style={{ maxHeight: 560 }}>
      <Text className="text-white text-lg font-sans-semibold px-5 mb-3">Send to</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        {(friends ?? []).map((friend) => (
          <View key={friend.id} className="flex-row items-center gap-3 py-2.5">
            <View className={friend.is_out ? 'rounded-full border-2 border-[#d4ff00]' : ''}>
              <Avatar name={friend.display_name} url={friend.avatar_url} size="md" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-white text-base font-sans-medium" numberOfLines={1}>
                {friend.display_name}
              </Text>
              {friend.is_out ? (
                <Text className="text-[#d4ff00] text-xs font-sans">Out tonight</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => send(friend)}
              disabled={!!sending || sent.has(friend.id)}
              className="px-4 py-2 rounded-full active:opacity-90"
              style={{
                backgroundColor: sent.has(friend.id) ? 'rgba(212,255,0,0.25)' : NEON,
              }}
            >
              {sending === friend.id ? (
                <ActivityIndicator size="small" color="#1a0f2e" />
              ) : (
                <Text className="text-[#1a0f2e] text-xs font-sans-semibold">
                  {sent.has(friend.id) ? 'Sent ✓' : 'Send'}
                </Text>
              )}
            </Pressable>
          </View>
        ))}
        {friends && friends.length === 0 ? (
          <Text className="text-white/50 text-sm font-sans py-6 text-center">
            No mutual friends to share with.
          </Text>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={shareExternal}
        className="flex-row items-center justify-center gap-2 mx-5 mt-2 py-3 rounded-full border border-white/20 active:bg-white/5"
      >
        <SymbolView name="square.and.arrow.up" size={15} tintColor="rgba(255,255,255,0.7)" />
        <Text className="text-white/80 text-sm font-sans-medium">Share outside Spotted</Text>
      </Pressable>
    </View>
  );
}
