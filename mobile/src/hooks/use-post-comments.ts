import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { notifyCommentAdded } from '@/lib/posts';
import { validateCommentText } from '@/lib/validation';
import { useSession } from './use-session';

export interface PostComment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  likes_count: number;
  liked_by_me: boolean;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Comments for one post: the list, existence check, composer state, send
 * and like toggle. Lifted verbatim from the retired /comments modal so the
 * comment sheet on the post detail behaves identically.
 */
export function usePostComments(postId: string | undefined) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ['comments', postId, session?.user.id];

  // A push or link can land here after the post expired at 5am. Without
  // this the screen showed an empty comment list with no explanation
  // (addendum v3 §4).
  const { data: postExists, isLoading: checkingPost, isError: postError } = useQuery({
    queryKey: ['comments-post-exists', postId, session?.user.id],
    enabled: !!postId && !!session,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select('id').eq('id', postId!).maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const { data: comments, isLoading, isError: commentsError } = useQuery({
    queryKey,
    enabled: !!postId && !!session,
    queryFn: async (): Promise<PostComment[]> => {
      const [{ data: rows, error: rowsError }, profiles] = await Promise.all([
        supabase
          .from('post_comments')
          .select('id, user_id, text, created_at, likes_count')
          .eq('post_id', postId!)
          .order('created_at', { ascending: true }),
        fetchProfilesSafe(),
      ]);
      if (rowsError) throw rowsError;
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

  /** Post `raw` (a quick emoji) or the draft. Resolves true when it landed. */
  const send = async (raw?: string): Promise<boolean> => {
    if (!session || !postId || sending) return false;
    const validation = validateCommentText(raw ?? draft);
    if (!validation.success) {
      setError(validation.error ?? 'invalid comment');
      return false;
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
      return false;
    }
    if (!raw) setDraft('');
    notifyCommentAdded(postId);
    queryClient.invalidateQueries({ queryKey });
    return true;
  };

  const toggleCommentLike = async (comment: PostComment) => {
    if (!session) return;
    const wasLiked = comment.liked_by_me;

    const patch = (liked: boolean, delta: number) =>
      queryClient.setQueryData<PostComment[]>(queryKey, (prev) =>
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

  return {
    comments: postExists ? comments ?? [] : [],
    isLoading,
    postExists,
    checkingPost,
    draft,
    setDraft,
    sending,
    error: error ?? (postError || commentsError ? 'Could not load comments. Reopen to retry.' : null),
    send,
    toggleCommentLike,
    currentUserId: session?.user.id,
  };
}
