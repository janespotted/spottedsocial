import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { DEMO_MODE } from '@/lib/demo-mode';
import { notifyPostLike } from '@/lib/notifications';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { onCommentAdded, onFeedInvalidated, resolvePostImageUrl } from '@/lib/posts';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

const POSTS_PER_PAGE = 10;

export interface FeedPost {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  media_type: string | null;
  venue_name: string | null;
  venue_id: string | null;
  created_at: string;
  comments_count: number;
  likes_count: number;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Newsfeed posts: own + friends', unexpired (posts die at 5am like stories),
 * newest first, cursor-paginated. Port of the web useFeed core. Demo posts
 * are excluded except in dev builds (see DEMO_MODE).
 */
export function useFeed() {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<FeedPost[]> => {
      if (!session) return [];
      const userIds = [session.user.id, ...(friendIds ?? [])];

      let query = supabase
        .from('posts')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(POSTS_PER_PAGE);
      // Dev-only: demo mode shows all demo posts alongside the real feed,
      // mirroring the web useFeed. Release builds never take this branch.
      if (DEMO_MODE) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        // Friends' posts (any visibility) + friends-of-friends' posts marked
        // mutual_friends — port of the web expansion via get_mutual_friend_ids.
        const { data: mutualData } = await supabase.rpc('get_mutual_friend_ids', {
          p_user_id: session.user.id,
        });
        const mutualIds = (mutualData ?? []).map((r: { user_id: string }) => r.user_id);
        if (mutualIds.length > 0) {
          query = query.or(
            `and(user_id.in.(${userIds.join(',')}),is_demo.eq.false),and(user_id.in.(${mutualIds.join(',')}),visibility.eq.mutual_friends,is_demo.eq.false)`
          );
        } else {
          query = query.in('user_id', userIds).eq('is_demo', false);
        }
      }
      if (cursor) query = query.lt('created_at', cursor);

      const [{ data: rows }, profiles] = await Promise.all([query, fetchProfilesSafe()]);
      const profileMap = buildProfileMap(profiles);

      // The likes_count/comments_count columns are NOT maintained by triggers
      // in the production DB (the trigger migration was never applied), so we
      // count the actual rows and add them to the column value. The column is
      // only nonzero for seeded demo posts; live activity exists solely as
      // post_likes/post_comments rows.
      const postIds = (rows ?? []).map((p) => p.id);
      const likeCounts = new Map<string, number>();
      const commentCounts = new Map<string, number>();
      if (postIds.length > 0) {
        const [{ data: likeRows }, { data: commentRows }] = await Promise.all([
          supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds),
          supabase.from('post_comments').select('post_id').in('post_id', postIds),
        ]);
        const mine = new Set<string>();
        for (const l of likeRows ?? []) {
          likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
          if (l.user_id === session.user.id) mine.add(l.post_id);
        }
        for (const c of commentRows ?? []) {
          commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1);
        }
        setLikedPosts((prev) => {
          const next = new Set(prev);
          for (const id of mine) next.add(id);
          return next;
        });
      }

      // Uploaded posts store a private-bucket path in image_url — swap for a
      // signed URL. Full http URLs (demo content) pass through untouched.
      const imageUrls = await Promise.all(
        (rows ?? []).map((p) => resolvePostImageUrl(p.image_url))
      );

      const page: FeedPost[] = (rows ?? []).map((p, i) => ({
        id: p.id,
        user_id: p.user_id,
        text: p.text ?? '',
        image_url: imageUrls[i],
        media_type: p.media_type,
        venue_name: p.venue_name,
        venue_id: p.venue_id,
        created_at: p.created_at ?? new Date().toISOString(),
        comments_count: (p.comments_count ?? 0) + (commentCounts.get(p.id) ?? 0),
        likes_count: (p.likes_count ?? 0) + (likeCounts.get(p.id) ?? 0),
        display_name: profileMap.get(p.user_id)?.display_name ?? 'Friend',
        avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
      }));
      return page;
    },
    [session, friendIds]
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    const page = await fetchPage(null);
    setPosts(page);
    setHasMore(page.length === POSTS_PER_PAGE);
    setIsRefreshing(false);
    setIsLoading(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || posts.length === 0) return;
    loadingMoreRef.current = true;
    const page = await fetchPage(posts[posts.length - 1].created_at);
    setPosts((prev) => [...prev, ...page]);
    setHasMore(page.length === POSTS_PER_PAGE);
    loadingMoreRef.current = false;
  }, [fetchPage, hasMore, posts]);

  useEffect(() => {
    if (!session || friendIds === undefined) return;
    refresh();
  }, [session, friendIds, refresh]);

  // Refresh immediately when a new post is created (composer calls invalidateFeed)
  useEffect(() => onFeedInvalidated(refresh), [refresh]);

  // Foreground refresh is handled by the resilient channel's onReconnect.

  // Bump the card count as soon as a comment is posted in the comments modal
  useEffect(
    () =>
      onCommentAdded((postId) => {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p))
        );
      }),
    []
  );

  // Realtime: prepend friends' new posts, drop deleted ones (port of the web
  // incremental handlers). RLS scopes what postgres_changes delivers, but we
  // still gate on authorship because demo posts are dev-only.
  useEffect(() => {
    if (!session || friendIds === undefined) return;
    const friendSet = new Set(friendIds ?? []);

    return createResilientChannel({
      name: 'feed-realtime',
      onReconnect: refresh,
      configure: (ch) => ch
        .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          const p = payload.new as Record<string, any>;
          if (!p?.id) return;
          const visible =
            p.user_id === session.user.id ||
            friendSet.has(p.user_id) ||
            (DEMO_MODE && p.is_demo);
          if (!visible) return;
          if (p.is_demo && !DEMO_MODE) return;
          const [profiles, imageUrl] = await Promise.all([
            fetchProfilesSafe(),
            resolvePostImageUrl(p.image_url ?? null),
          ]);
          const profileMap = buildProfileMap(profiles);
          const post: FeedPost = {
            id: p.id,
            user_id: p.user_id,
            text: p.text ?? '',
            image_url: imageUrl,
            media_type: p.media_type ?? null,
            venue_name: p.venue_name ?? null,
            venue_id: p.venue_id ?? null,
            created_at: p.created_at ?? new Date().toISOString(),
            comments_count: 0,
            likes_count: 0,
            display_name: profileMap.get(p.user_id)?.display_name ?? 'Friend',
            avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
          };
          setPosts((prev) => (prev.some((x) => x.id === post.id) ? prev : [post, ...prev]));
        }
      )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'posts' },
          (payload) => {
            const id = (payload.old as Record<string, any>)?.id;
            if (id) setPosts((prev) => prev.filter((x) => x.id !== id));
          }
        ),
    });
  }, [session, friendIds, refresh]);

  const toggleLike = useCallback(
    async (postId: string) => {
      if (!session) return;
      const isLiked = likedPosts.has(postId);
      if (!isLiked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Optimistic update
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (isLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likes_count: Math.max(0, p.likes_count + (isLiked ? -1 : 1)) }
            : p
        )
      );

      const { error } = isLiked
        ? await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', session.user.id)
        : await supabase.from('post_likes').insert({ post_id: postId, user_id: session.user.id });

      if (!error && !isLiked) {
        const post = posts.find((p) => p.id === postId);
        if (post) notifyPostLike(post, session.user.id); // fire-and-forget
      }

      if (error) {
        // Roll back on failure
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (isLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, likes_count: Math.max(0, p.likes_count + (isLiked ? 1 : -1)) }
              : p
          )
        );
      }
    },
    [session, likedPosts, posts]
  );

  const deletePost = useCallback(
    async (postId: string) => {
      if (!session) return;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', session.user.id);
      if (error) refresh(); // restore on failure
    },
    [session, refresh]
  );

  return { posts, likedPosts, isLoading, isRefreshing, hasMore, refresh, loadMore, toggleLike, deletePost };
}

export function getTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
