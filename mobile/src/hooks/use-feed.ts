import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { isDemoMode } from '@/lib/demo-mode';
import { notifyPostLike } from '@/lib/notifications';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { fetchTagsForPosts, type TaggedFriend } from '@/lib/post-tags';
import {
  onCommentAdded,
  onFeedInvalidated,
  postImageStoragePath,
  resolvePostImageUrl,
  resolvePostImageUrls,
} from '@/lib/posts';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

const POSTS_PER_PAGE = 10;

export interface FeedPost {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  /** Stable storage path (expo-image cache key); null for external URLs. */
  media_path: string | null;
  media_type: string | null;
  media_width: number | null;
  media_height: number | null;
  /** ThumbHash placeholder, base64. */
  media_hash: string | null;
  /** Mux video: playback id once encoded; status preparing | ready | errored. */
  mux_playback_id: string | null;
  mux_status: string | null;
  venue_name: string | null;
  venue_id: string | null;
  created_at: string;
  comments_count: number;
  likes_count: number;
  display_name: string;
  avatar_url: string | null;
  /** Friends tagged in the post (addendum v3 §9.3); RLS keeps these inside the audience. */
  tags: TaggedFriend[];
}

/**
 * Newsfeed posts: own + friends', unexpired (posts die at 5am like stories),
 * newest first, cursor-paginated. Port of the web useFeed core. Demo posts
 * are excluded except in dev builds (see isDemoMode()).
 */
// Stable fallback so a failed friend-ids query can't hand the effects a fresh
// [] every render (a new reference would re-run the feed fetch each time).
const NO_FRIENDS: string[] = [];

export function useFeed() {
  const { session } = useSession();
  const userId = session?.user.id;
  const friendQuery = useFriendIds(userId);
  // undefined = still loading (feed waits); a failed query degrades to own posts
  const friendIds = friendQuery.data ?? (friendQuery.isError ? NO_FRIENDS : undefined);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // A failed page-one load: the screen shows an error, never an empty feed
  const [isError, setIsError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null): Promise<FeedPost[]> => {
      if (!userId) return [];
      const userIds = [userId, ...(friendIds ?? [])];

      let query = supabase
        .from('posts')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(POSTS_PER_PAGE);
      // Dev-only: demo mode shows all demo posts alongside the real feed,
      // mirroring the web useFeed. Release builds never take this branch.
      if (isDemoMode()) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        // Friends' posts (any visibility) + friends-of-friends' posts marked
        // mutual_friends — port of the web expansion via get_mutual_friend_ids.
        const { data: mutualData } = await supabase.rpc('get_mutual_friend_ids', {
          p_user_id: userId,
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
          if (l.user_id === userId) mine.add(l.post_id);
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
      // signed URL, one Storage call for the whole page. Full http URLs
      // (demo content) pass through untouched.
      const [imageUrls, tagsByPost] = await Promise.all([
        resolvePostImageUrls((rows ?? []).map((p) => p.image_url)),
        fetchTagsForPosts((rows ?? []).map((p) => p.id)),
      ]);

      const page: FeedPost[] = (rows ?? []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        text: p.text ?? '',
        image_url: p.image_url ? (imageUrls.get(p.image_url) ?? null) : null,
        media_path: postImageStoragePath(p.image_url),
        media_type: p.media_type,
        media_width: p.media_width,
        media_height: p.media_height,
        media_hash: p.media_hash,
        mux_playback_id: p.mux_playback_id,
        mux_status: p.mux_status,
        venue_name: p.venue_name,
        venue_id: p.venue_id,
        created_at: p.created_at ?? new Date().toISOString(),
        comments_count: (p.comments_count ?? 0) + (commentCounts.get(p.id) ?? 0),
        likes_count: (p.likes_count ?? 0) + (likeCounts.get(p.id) ?? 0),
        display_name: profileMap.get(p.user_id)?.display_name ?? 'Friend',
        avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
        tags: tagsByPost.get(p.id) ?? [],
      }));
      return page;
    },
    [userId, friendIds]
  );

  /**
   * Reload page one. Single-flight: a foreground, a realtime reconnect and a
   * composer invalidation routinely land together, and each used to run its
   * own fetch and flip the pull-to-refresh spinner. Concurrent calls now
   * share the in-flight fetch (one more run is queued so nothing is missed),
   * and only a user pull shows the RefreshControl spinner — background
   * refreshes are silent. try/finally so a failed fetch can't leave the
   * spinner (or the initial skeleton) stuck on forever.
   */
  const refresh = useCallback(
    (opts?: { userInitiated?: boolean }): Promise<void> => {
      if (opts?.userInitiated) setIsRefreshing(true);
      if (refreshInFlight.current) {
        refreshQueued.current = true;
        return refreshInFlight.current;
      }
      const run = (async () => {
        try {
          const page = await fetchPage(null);
          setPosts(page);
          setHasMore(page.length === POSTS_PER_PAGE);
          setIsError(false);
        } catch (e) {
          console.warn('[feed] refresh failed', e);
          setIsError(true);
        } finally {
          refreshInFlight.current = null;
          setIsRefreshing(false);
          setIsLoading(false);
        }
        if (refreshQueued.current) {
          refreshQueued.current = false;
          await refresh();
        }
      })();
      refreshInFlight.current = run;
      return run;
    },
    [fetchPage]
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || posts.length === 0) return;
    loadingMoreRef.current = true;
    try {
      const page = await fetchPage(posts[posts.length - 1].created_at);
      setPosts((prev) => [...prev, ...page]);
      setHasMore(page.length === POSTS_PER_PAGE);
    } catch (e) {
      console.warn('[feed] loadMore failed', e);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [fetchPage, hasMore, posts]);

  useEffect(() => {
    if (!userId || friendIds === undefined) return;
    refresh();
  }, [userId, friendIds, refresh]);

  // Refresh immediately when a new post is created (composer calls invalidateFeed)
  useEffect(() => onFeedInvalidated(() => void refresh()), [refresh]);

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
    if (!userId || friendIds === undefined) return;
    const friendSet = new Set(friendIds);

    return createResilientChannel({
      name: 'feed-realtime',
      onReconnect: () => void refresh(),
      configure: (ch) => ch
        .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        async (payload) => {
          const p = payload.new as Record<string, any>;
          if (!p?.id) return;
          const visible =
            p.user_id === userId ||
            friendSet.has(p.user_id) ||
            (isDemoMode() && p.is_demo);
          if (!visible) return;
          if (p.is_demo && !isDemoMode()) return;
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
            media_path: postImageStoragePath(p.image_url ?? null),
            media_type: p.media_type ?? null,
            media_width: p.media_width ?? null,
            media_height: p.media_height ?? null,
            media_hash: p.media_hash ?? null,
            mux_playback_id: p.mux_playback_id ?? null,
            mux_status: p.mux_status ?? null,
            venue_name: p.venue_name ?? null,
            venue_id: p.venue_id ?? null,
            created_at: p.created_at ?? new Date().toISOString(),
            comments_count: 0,
            likes_count: 0,
            display_name: profileMap.get(p.user_id)?.display_name ?? 'Friend',
            avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
            // Tags are written just after the post row; the next refresh
            // picks them up.
            tags: [],
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
        )
        // Mux finishing an encode: the webhook updates the row and the
        // processing tile becomes a player without a refresh.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'posts' },
          (payload) => {
            const p = payload.new as Record<string, any>;
            if (!p?.id) return;
            setPosts((prev) =>
              prev.map((x) =>
                x.id === p.id
                  ? {
                      ...x,
                      mux_playback_id: p.mux_playback_id ?? null,
                      mux_status: p.mux_status ?? null,
                      media_width: p.media_width ?? x.media_width,
                      media_height: p.media_height ?? x.media_height,
                    }
                  : x
              )
            );
          }
        ),
    });
  }, [userId, friendIds, refresh]);

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

  return { posts, likedPosts, isLoading, isRefreshing, isError, hasMore, refresh, loadMore, toggleLike, deletePost };
}

export function getTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
