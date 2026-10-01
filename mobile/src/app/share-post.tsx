import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { APP_BASE_URL } from '@/lib/invites';
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
  const { postId, authorName } = useLocalSearchParams<{
    postId: string;
    authorId: string;
    authorName?: string;
  }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const { data: friends, isError, isLoading, refetch } = useQuery({
    queryKey: ['share-friends', userId, postId],
    enabled: !!session && !!postId,
    queryFn: async (): Promise<ShareFriend[]> => {
      const { data, error } = await supabase.rpc('get_post_share_recipients', { p_post: postId });
      if (error) throw error;
      return (data ?? []) as ShareFriend[];
    },
  });

  const send = async (friend: ShareFriend) => {
    if (!userId || !postId || sending) return;
    setSending(friend.id);
    try {
      const { error } = await supabase.rpc('share_post_to_dm', { p_post: postId, p_recipient: friend.id });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent((prev) => new Set(prev).add(friend.id));
    } catch {
      Alert.alert('Post not sent', 'The recipient may no longer have access. Refresh and try again.');
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
      {isLoading ? <ActivityIndicator color={NEON} /> : null}
      {isError ? <Text className="text-red-300 px-5 py-3" onPress={() => void refetch()}>Could not load eligible recipients. Tap to retry.</Text> : null}
      {!postId ? <Text className="text-white/60 px-5">This post is unavailable.</Text> : null}
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
            No friends currently have access to this post.
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
