import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { openFriendCard } from '@/lib/friend-card';
import { getTimeAgo } from '@/hooks/use-feed';
import type { PostComment } from '@/hooks/use-post-comments';
import { dismissKeyboardNow } from '@/hooks/use-dismiss-keyboard-on-leave';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

/**
 * One comment. A tap on the row closes the keyboard (addendum v3 §8.2:
 * keyboardShouldPersistTaps="handled" keeps it up for taps on list content,
 * so rows must dismiss it themselves); the avatar, name and heart keep
 * their own handlers.
 */
export function CommentRow({
  comment,
  currentUserId,
  onToggleLike,
}: {
  comment: PostComment;
  currentUserId: string | undefined;
  onToggleLike: (comment: PostComment) => void;
}) {
  return (
    <Pressable onPress={dismissKeyboardNow} accessible={false} className="flex-row gap-3">
      <Pressable onPress={() => openFriendCard(comment.user_id, currentUserId)} hitSlop={4}>
        <Avatar name={comment.display_name} url={comment.avatar_url} size="sm" />
      </Pressable>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-sans text-white leading-snug">
          <Text
            className="font-sans-semibold"
            onPress={() => openFriendCard(comment.user_id, currentUserId)}
          >
            {comment.display_name}
          </Text>{' '}
          <Text className="text-white/55 text-xs">{getTimeAgo(comment.created_at)}</Text>
        </Text>
        <Text className="text-white/90 text-sm font-sans leading-snug mt-0.5">{comment.text}</Text>
      </View>
      <Pressable
        onPress={() => onToggleLike(comment)}
        hitSlop={8}
        accessibilityLabel={comment.liked_by_me ? 'Unlike comment' : 'Like comment'}
        className="items-center gap-0.5 pt-1 active:scale-90"
      >
        <SymbolView
          name={comment.liked_by_me ? 'heart.fill' : 'heart'}
          size={16}
          tintColor={comment.liked_by_me ? NEON : 'rgba(255,255,255,0.4)'}
        />
        {comment.likes_count > 0 ? (
          <Text className="text-white/55 text-[11px] font-sans">{comment.likes_count}</Text>
        ) : null}
      </Pressable>
    </Pressable>
  );
}
