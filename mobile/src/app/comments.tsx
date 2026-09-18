import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { notifyCommentAdded } from '@/lib/posts';
import { openFriendCard } from '@/lib/friend-card';
import { validateCommentText } from '@/lib/validation';
import { useSession } from '@/hooks/use-session';
import { dismissKeyboardNow, useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { getTimeAgo } from '@/hooks/use-feed';
import { Avatar } from '@/components/avatar';
import { ExpiredState } from '@/components/empty-state';
import { NEON } from '@/lib/theme';

const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];

interface Comment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  likes_count: number;
  liked_by_me: boolean;
  display_name: string;
  avatar_url: string | null;
}

/** Comments for one post — presented as a modal sheet from the feed. */
export default function CommentsScreen() {
  useDismissKeyboardOnLeave();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ['comments', postId];

  // A push or link can land here after the post expired at 5am. Without
  // this the screen showed an empty comment list with no explanation
  // (addendum v3 §4).
  const { data: postExists, isLoading: checkingPost } = useQuery({
    queryKey: ['comments-post-exists', postId],
    enabled: !!postId && !!session,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.from('posts').select('id').eq('id', postId!).maybeSingle();
      return !!data;
    },
  });

  const { data: comments, isLoading } = useQuery({
    queryKey,
    enabled: !!postId && !!session,
    queryFn: async (): Promise<Comment[]> => {
      const [{ data: rows }, profiles] = await Promise.all([
        supabase
          .from('post_comments')
          .select('id, user_id, text, created_at, likes_count')
          .eq('post_id', postId!)
          .order('created_at', { ascending: true }),
        fetchProfilesSafe(),
      ]);
      const profileMap = buildProfileMap(profiles);

      // Like the feed: the likes_count column has no maintaining trigger in
      // prod, so add the live row count on top of the (seed-only) column.
      const likeCounts = new Map<string, number>();
      const mine = new Set<string>();
      if (rows?.length) {
        const { data: likeRows } = await supabase
          .from('post_comment_likes')
          .select('comment_id, user_id')
          .in('comment_id', rows.map((c) => c.id));
        for (const l of likeRows ?? []) {
          likeCounts.set(l.comment_id, (likeCounts.get(l.comment_id) ?? 0) + 1);
          if (l.user_id === session!.user.id) mine.add(l.comment_id);
        }
      }

      return (rows ?? []).map((c) => ({
        id: c.id,
        user_id: c.user_id,
        text: c.text,
        created_at: c.created_at ?? new Date().toISOString(),
        likes_count: (c.likes_count ?? 0) + (likeCounts.get(c.id) ?? 0),
        liked_by_me: mine.has(c.id),
        display_name: profileMap.get(c.user_id)?.display_name ?? 'Friend',
        avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
      }));
    },
  });

  const send = async (raw?: string) => {
    if (!session || !postId || sending) return;
    const validation = validateCommentText(raw ?? draft);
    if (!validation.success) {
      setError(validation.error ?? 'invalid comment');
      return;
    }
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: session.user.id,
      text: validation.data!,
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (!raw) setDraft('');
    Keyboard.dismiss(); // a sent comment ends the input (addendum v3 §8.2)
    notifyCommentAdded(postId);
    queryClient.invalidateQueries({ queryKey });
  };

  const toggleCommentLike = async (comment: Comment) => {
    if (!session) return;
    const wasLiked = comment.liked_by_me;

    const patch = (liked: boolean, delta: number) =>
      queryClient.setQueryData<Comment[]>(queryKey, (prev) =>
        prev?.map((c) =>
          c.id === comment.id
            ? { ...c, liked_by_me: liked, likes_count: Math.max(0, c.likes_count + delta) }
            : c
        )
      );

    patch(!wasLiked, wasLiked ? -1 : 1);
    const { error: err } = wasLiked
      ? await supabase
          .from('post_comment_likes')
          .delete()
          .eq('comment_id', comment.id)
          .eq('user_id', session.user.id)
      : await supabase
          .from('post_comment_likes')
          .insert({ comment_id: comment.id, user_id: session.user.id });
    if (err) patch(wasLiked, wasLiked ? 1 : -1); // roll back
  };

  return (
    <View className="flex-1 bg-[#110a24]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
        <Text className="text-white text-base font-sans-semibold">Comments</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {isLoading || checkingPost ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEON} />
        </View>
      ) : postExists === false ? (
        <ExpiredState what="This post" onDismiss={() => router.back()} dismissLabel="Close" />
      ) : (
        <KeyboardAwareLegendList
          recycleItems
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          keyboardOffset={insets.bottom}
          // Tapping empty space closes the keyboard: keyboardShouldPersistTaps
          // only covers taps that hit list CONTENT, so the background needs
          // its own handler (addendum v3 §8.2).
          onScrollBeginDrag={dismissKeyboardNow}
          ListFooterComponent={
            <Pressable
              onPress={dismissKeyboardNow}
              accessible={false}
              style={{ height: 120 }}
            />
          }
          ListEmptyComponent={
            <Text className="text-white/55 text-sm font-sans text-center py-12">
              No comments yet — say something first.
            </Text>
          }
          renderItem={({ item }) => (
            // A tap on the row closes the keyboard; the avatar, name and
            // like button keep their own handlers.
            <Pressable onPress={dismissKeyboardNow} accessible={false} className="flex-row gap-3">
              <Pressable onPress={() => openFriendCard(item.user_id, session?.user.id)} hitSlop={4}>
                <Avatar name={item.display_name} url={item.avatar_url} size="sm" />
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-sans text-white leading-snug">
                  <Text
                    className="font-sans-semibold"
                    onPress={() => openFriendCard(item.user_id, session?.user.id)}
                  >
                    {item.display_name}
                  </Text>{' '}
                  <Text className="text-white/55 text-xs">{getTimeAgo(item.created_at)}</Text>
                </Text>
                <Text className="text-white/90 text-sm font-sans leading-snug mt-0.5">
                  {item.text}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleCommentLike(item)}
                hitSlop={8}
                className="items-center gap-0.5 pt-1 active:scale-90"
              >
                <SymbolView
                  name={item.liked_by_me ? 'heart.fill' : 'heart'}
                  size={16}
                  tintColor={item.liked_by_me ? NEON : 'rgba(255,255,255,0.4)'}
                />
                {item.likes_count > 0 ? (
                  <Text className="text-white/55 text-[11px] font-sans">{item.likes_count}</Text>
                ) : null}
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Composer — hidden once the post is gone; KeyboardStickyView reads global keyboard values, so it
          tracks the keyboard even inside this native modal (where
          KeyboardAvoidingView needs manual offsets). The opened offset gives
          back the safe-area padding so only 12px rides above the keyboard. */}
      {postExists === false ? null : (
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View className="border-t border-white/10 bg-[#110a24]">
          {/* Quick-emoji react row (posts the emoji as a comment, like web) */}
          <View className="flex-row items-center justify-around px-4 py-2 border-b border-white/[0.06]">
            {QUICK_EMOJIS.map((emoji) => (
              <Pressable key={emoji} onPress={() => send(emoji)} hitSlop={6} className="active:scale-125">
                <Text className="text-xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {error ? (
            <Text selectable className="text-xs text-red-400 font-sans px-4 pt-2">
              {error}
            </Text>
          ) : null}

          <View className="flex-row items-center gap-3 px-4 py-3 pb-safe-offset-3">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment..."
              placeholderTextColorClassName="accent-white/30"
              multiline
              maxLength={500}
              className="flex-1 min-h-10 max-h-24 rounded-2xl bg-white/5 border border-white/15 px-4 py-2.5 text-white text-[15px] font-sans"
            />
            <Pressable
              onPress={() => send()}
              disabled={!draft.trim() || sending}
              hitSlop={8}
              className="w-10 h-10 rounded-full items-center justify-center disabled:opacity-30"
              style={{ backgroundColor: NEON }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#1a0f2e" />
              ) : (
                <SymbolView name="arrow.up" size={18} tintColor="#1a0f2e" weight="semibold" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
      )}
    </View>
  );
}
