import { AppState } from 'react-native';
import { onPrivateViewsInvalidated } from '@/lib/private-views';
import { getSessionRevision } from '@/lib/session-identity';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { isDemoMode } from '@/lib/demo-mode';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { isPostDetailActive, onPostDetailClosed, resetPostDetail } from '@/lib/post-detail';
import {
  hydratePosts,
  onCommentAdded,
  onFeedInvalidated,
  type FeedPost,
} from '@/lib/posts';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

const POSTS_PER_PAGE = 10;

// The post shape lives with its hydration in lib/posts.ts; re-exported so
// every existing `import type { FeedPost } from '@/hooks/use-feed'` holds.
export type { FeedPost } from '@/lib/posts';

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
  const generation = useRef(0);
  const loadedCount = useRef(POSTS_PER_PAGE);
  loadedCount.current = Math.max(POSTS_PER_PAGE, posts.length);

  const fetchPage = useCallback(
    async (cursor: string | null, limit = POSTS_PER_PAGE): Promise<FeedPost[]> => {
      if (!userId) return [];
      if (friendQuery.isError) throw new Error("Could not load relationships");
      const revision = getSessionRevision();
      const started = generation.current;
      const userIds = [userId, ...(friendIds ?? [])];

      let query = supabase
        .from('posts')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);
      // Dev-only: demo mode shows all demo posts alongside the real feed,
      // mirroring the web useFeed. Release builds never take this branch.
      if (isDemoMode()) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        // Friends' posts (any visibility) + friends-of-friends' posts marked
        // mutual_friends — port of the web expansion via get_mutual_friend_ids.
        const { data: mutualData, error: mutualError } = await supabase.rpc('get_mutual_friend_ids', {
          p_user_id: userId,
        });
        if (mutualError) throw mutualError;
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

      const { data: rows, error } = await query;
      if (error) throw error;
      const { posts: page, likedByMe } = await hydratePosts(rows ?? [], userId);
      if (revision !== getSessionRevision() || started !== generation.current) return [];
      if (likedByMe.size > 0) {
        setLikedPosts((prev) => {
          const next = new Set(prev);
          for (const id of likedByMe) next.add(id);
          return next;
        });
      }
      return page;
    },
    [userId, friendIds, friendQuery.isError]
  );

  // While a post detail is open, one feed card's media is teleported into
  // it and the list is scroll-locked. LegendList recycles row components,
  // so a data change now (a realtime prepend, a refresh) could hand that
  // row a different post and swap the video on the detail screen. Data
  // changes are queued here and replayed the moment the detail closes
  // (POST-DETAIL-PLAN.md §4.5).
  const deferred = useRef<Array<() => void>>([]);
  useEffect(
    () =>
      onPostDetailClosed(() => {
        const queue = deferred.current;
        deferred.current = [];
        for (const fn of queue) fn();
      }),
    []
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
      if (isPostDetailActive()) {
        // Replayed when the detail closes; a pull can't happen while the
        // list is scroll-locked, so there is no spinner to honour here.
        deferred.current = [() => void refresh(opts)];
        return Promise.resolve();
      }
      if (opts?.userInitiated) setIsRefreshing(true);
      if (refreshInFlight.current) {
        refreshQueued.current = true;
        return refreshInFlight.current;
      }
      const started = generation.current;
      const revision = getSessionRevision();
      const run = (async () => {
        try {
          const limit = opts?.userInitiated ? POSTS_PER_PAGE : loadedCount.current;
          const page = await fetchPage(null, limit);
          if (started !== generation.current || revision !== getSessionRevision()) return;
          setPosts(page);
          setHasMore(page.length === limit);
          setIsError(false);
        } catch (e) {
          if (started !== generation.current || revision !== getSessionRevision()) return;
          setPosts([]); setLikedPosts(new Set());
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
    if (!hasMore || loadingMoreRef.current || posts.length === 0 || isPostDetailActive()) return;
    loadingMoreRef.current = true;
    const started = generation.current;
    const revision = getSessionRevision();
    try {
      const page = await fetchPage(posts[posts.length - 1].created_at);
      if (started !== generation.current || revision !== getSessionRevision()) return;
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

  // Re-read with the same server authorization as initial load, including mutuals.
  useEffect(() => {
    if (!userId || friendIds === undefined) return;
    return createResilientChannel({
      name: 'feed-realtime', onReconnect: () => void refresh(),
      configure: ch => ch.on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => void refresh()),
    });
  }, [userId, friendIds, refresh]);

  useEffect(() => {
    const redact = () => {
      ++generation.current;
      deferred.current = [];
      resetPostDetail();
      setPosts([]); setLikedPosts(new Set());
    };
    const stop = onPrivateViewsInvalidated(() => { redact(); void refresh(); });
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') redact(); else void refresh();
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15_000);
    return () => { ++generation.current; stop(); sub.remove(); clearInterval(timer); };
  }, [refresh]);

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
    [session, likedPosts]
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
