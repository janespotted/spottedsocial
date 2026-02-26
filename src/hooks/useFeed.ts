import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { haptic } from '@/lib/haptics';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';
import { validateCommentText } from '@/lib/validation-schemas';
import { resolvePostImageUrls } from '@/lib/storage-utils';

const POSTS_PER_PAGE = 20;

export interface Post {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  venue_name: string | null;
  venue_id: string | null;
  created_at: string;
  comments_count: number;
  likes_count: number;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  created_at: string;
  likes_count: number;
  profiles: {
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
}

export interface Friend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface UseFeedOptions {
  userId: string | undefined;
  demoEnabled: boolean;
  city?: string;
  onCachePosts?: (posts: Post[]) => void;
  onCacheFriends?: (friends: Friend[]) => void;
  getCachedPosts?: () => Post[] | null;
  getCachedFriends?: () => Friend[] | null;
}

export function useFeed(options: UseFeedOptions) {
  const { userId, demoEnabled, city, onCachePosts, onCacheFriends, getCachedPosts, getCachedFriends } = options;
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: PostComment[] }>({});
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({});
  const [animatingLike, setAnimatingLike] = useState<string | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const getTimeAgo = useCallback((date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance
      .replace(/less than a minute|a few seconds/i, '1m')
      .replace('about ', '')
      .replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h')
      .replace(' days', 'd').replace(' day', 'd');
  }, []);

  const fetchFriends = useCallback(async () => {
    if (!userId) return;

    try {
      const [sentFriendships, receivedFriendships] = await withRetry(
        () => Promise.all([
          supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', userId)
            .eq('status', 'accepted'),
          supabase
            .from('friendships')
            .select('user_id')
            .eq('friend_id', userId)
            .eq('status', 'accepted'),
        ]),
        { maxAttempts: 3, onRetry: (attempt) => logger.warn('feed:friends_retry', { attempt }) }
      );

      const friendIds = [
        ...(sentFriendships.data?.map(f => f.friend_id) || []),
        ...(receivedFriendships.data?.map(f => f.user_id) || []),
      ];

      const uniqueFriendIds = [...new Set(friendIds)];

      if (uniqueFriendIds.length > 0) {
        let profileQuery = supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', uniqueFriendIds);

        if (!demoEnabled) {
          profileQuery = profileQuery.eq('is_demo', false);
        }

        const { data: friendProfiles } = await profileQuery;

        if (friendProfiles) {
          const friendsList = friendProfiles.map(f => ({
            user_id: f.id,
            display_name: f.display_name,
            avatar_url: f.avatar_url,
          }));
          setFriends(friendsList);
          onCacheFriends?.(friendsList);
        }
      }
    } catch (error) {
      logger.apiError('fetchFriends', error);
      const cached = getCachedFriends?.();
      if (cached) setFriends(cached);
    }
  }, [userId, demoEnabled, onCacheFriends, getCachedFriends]);

  const fetchPosts = useCallback(async (cursor?: string) => {
    if (!userId) return;

    const isLoadMore = !!cursor;
    if (isLoadMore) setIsLoadingMore(true);

    try {
      const [sentFriendships, receivedFriendships] = await withRetry(
        () => Promise.all([
          supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
          supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
        ]),
        { maxAttempts: 3, onRetry: (attempt) => logger.warn('feed:posts_retry', { attempt }) }
      );

      const friendIds = [
        ...(sentFriendships.data?.map(f => f.friend_id) || []),
        ...(receivedFriendships.data?.map(f => f.user_id) || []),
      ];
      const uniqueFriendIds = [...new Set(friendIds)];
      const userIds = [userId, ...uniqueFriendIds];

      let query = supabase
        .from('posts')
        .select(`
          *,
          profiles:user_id (
            display_name,
            username,
            avatar_url
          )
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(POSTS_PER_PAGE);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      if (demoEnabled) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        query = query.in('user_id', userIds).eq('is_demo', false);
      }

      const { data } = await query;
      const fetchedPosts = data || [];
      
      // Resolve signed URLs for post images
      const resolvedPosts = await resolvePostImageUrls(fetchedPosts);

      setHasMorePosts(resolvedPosts.length === POSTS_PER_PAGE);

      if (isLoadMore) {
        setPosts(prev => [...prev, ...resolvedPosts]);
      } else {
        setPosts(resolvedPosts);
        onCachePosts?.(resolvedPosts);
      }

      if (fetchedPosts.length > 0) {
        const postIds = fetchedPosts.map(p => p.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', postIds);
        
        if (isLoadMore) {
          setLikedPosts(prev => {
            const newSet = new Set(prev);
            likes?.forEach(l => newSet.add(l.post_id));
            return newSet;
          });
        } else {
          setLikedPosts(new Set(likes?.map(l => l.post_id) || []));
        }
      }
    } catch (error) {
      logger.apiError('fetchPosts', error);
      if (!cursor) {
        const cached = getCachedPosts?.();
        if (cached) setPosts(cached);
      }
    } finally {
      if (isLoadMore) setIsLoadingMore(false);
    }
  }, [userId, demoEnabled, city, onCachePosts, getCachedPosts]);

  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || isLoadingMore || posts.length === 0) return;
    const lastPost = posts[posts.length - 1];
    await fetchPosts(lastPost.created_at);
  }, [fetchPosts, hasMorePosts, isLoadingMore, posts]);

  const handleIncrementalNewPost = useCallback(async (payload: any) => {
    if (!userId) return;
    const newRecord = payload.new;
    if (!newRecord?.id) return;

    const { data } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('id', newRecord.id)
      .single();

    if (!data) return;

    // Resolve signed URL for image
    const [resolvedPost] = await resolvePostImageUrls([data]);

    const isOwnPost = resolvedPost.user_id === userId;
    if (!isOwnPost) {
      const [sent, received] = await Promise.all([
        supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('friend_id', resolvedPost.user_id).eq('status', 'accepted').maybeSingle(),
        supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('user_id', resolvedPost.user_id).eq('status', 'accepted').maybeSingle(),
      ]);
      if (!sent.data && !received.data) return;
    }

    setPosts(prev => {
      if (prev.some(p => p.id === data.id)) return prev;
      return [data, ...prev];
    });
  }, [userId]);

  const handleIncrementalDelete = useCallback((payload: any) => {
    const deletedId = payload.old?.id;
    if (deletedId) {
      setPosts(prev => prev.filter(p => p.id !== deletedId));
    }
  }, []);

  const fetchComments = useCallback(async (postId: string) => {
    const { data } = await supabase
      .from('post_comments')
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (data) {
      setComments(prev => ({ ...prev, [postId]: data }));
      
      if (userId && data.length > 0) {
        const commentIds = data.map(c => c.id);
        const { data: commentLikes } = await supabase
          .from('post_comment_likes')
          .select('comment_id')
          .eq('user_id', userId)
          .in('comment_id', commentIds);
        
        if (commentLikes) {
          setLikedComments(prev => {
            const newSet = new Set(prev);
            commentLikes.forEach(l => newSet.add(l.comment_id));
            return newSet;
          });
        }
      }
    }
  }, [userId]);

  const handleToggleComments = useCallback(async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
    } else {
      setExpandedPostId(postId);
      if (!comments[postId]) {
        await fetchComments(postId);
      }
    }
  }, [expandedPostId, comments, fetchComments]);

  const handlePostComment = useCallback(async (postId: string, text?: string) => {
    const rawText = text ?? newComment[postId];
    if (!rawText || !userId) return;

    const validation = validateCommentText(rawText);
    if (!validation.success) {
      logger.warn('feed:invalid_comment', { error: validation.error });
      return;
    }

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      text: validation.data!,
    });

    if (error) {
      console.error('Error posting comment:', error);
      return;
    }

    if (!text) {
      setNewComment(prev => ({ ...prev, [postId]: '' }));
    }
    await fetchComments(postId);
    await fetchPosts();
  }, [newComment, userId, fetchComments, fetchPosts]);

  const handleLikePost = useCallback(async (postId: string) => {
    if (!userId) return;

    const isLiked = likedPosts.has(postId);
    
    if (!isLiked) {
      haptic.light();
      setAnimatingLike(postId);
      setTimeout(() => setAnimatingLike(null), 500);
    }

    // Optimistic UI update
    if (isLiked) {
      setLikedPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: Math.max((p.likes_count || 0) - 1, 0) } : p));

      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error unliking post:', error);
        setLikedPosts(prev => new Set(prev).add(postId));
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p));
      }
    } else {
      setLikedPosts(prev => new Set(prev).add(postId));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p));

      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId });

      if (error) {
        console.error('Error liking post:', error);
        setLikedPosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: Math.max((p.likes_count || 0) - 1, 0) } : p));
      }
    }
  }, [userId, likedPosts]);

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!userId) return;

    setPosts(prev => prev.filter(p => p.id !== postId));

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting post:', error);
      await fetchPosts();
    }
  }, [userId, fetchPosts]);

  const handleLikeComment = useCallback(async (commentId: string, postId: string) => {
    if (!userId) return;

    const isLiked = likedComments.has(commentId);

    // Optimistic update
    setComments(prev => ({
      ...prev,
      [postId]: prev[postId]?.map(c => c.id === commentId ? { ...c, likes_count: isLiked ? Math.max((c.likes_count || 0) - 1, 0) : (c.likes_count || 0) + 1 } : c) || []
    }));

    if (isLiked) {
      setLikedComments(prev => {
        const newSet = new Set(prev);
        newSet.delete(commentId);
        return newSet;
      });

      const { error } = await supabase
        .from('post_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error unliking comment:', error);
        setComments(prev => ({
          ...prev,
          [postId]: prev[postId]?.map(c => c.id === commentId ? { ...c, likes_count: (c.likes_count || 0) + 1 } : c) || []
        }));
        setLikedComments(prev => new Set(prev).add(commentId));
      }
    } else {
      setLikedComments(prev => new Set(prev).add(commentId));

      const { error } = await supabase
        .from('post_comment_likes')
        .insert({ comment_id: commentId, user_id: userId });

      if (error) {
        console.error('Error liking comment:', error);
        setComments(prev => ({
          ...prev,
          [postId]: prev[postId]?.map(c => c.id === commentId ? { ...c, likes_count: Math.max((c.likes_count || 0) - 1, 0) } : c) || []
        }));
        setLikedComments(prev => {
          const newSet = new Set(prev);
          newSet.delete(commentId);
          return newSet;
        });
      }
    }
  }, [userId, likedComments]);

  return {
    posts,
    setPosts,
    friends,
    likedPosts,
    likedComments,
    expandedPostId,
    comments,
    newComment,
    setNewComment,
    animatingLike,
    hasMorePosts,
    isLoadingMore,
    getTimeAgo,
    fetchFriends,
    fetchPosts,
    fetchComments,
    handleToggleComments,
    handlePostComment,
    handleLikePost,
    handleLikeComment,
    handleDeletePost,
    loadMorePosts,
    handleIncrementalNewPost,
    handleIncrementalDelete,
  };
}
