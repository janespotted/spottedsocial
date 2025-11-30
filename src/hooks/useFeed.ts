import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { haptic } from '@/lib/haptics';

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

export interface StoryUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  has_unviewed: boolean;
  story_count: number;
}

interface UseFeedOptions {
  userId: string | undefined;
  demoEnabled: boolean;
  onCachePosts?: (posts: Post[]) => void;
  onCacheFriends?: (friends: Friend[]) => void;
  onCacheStories?: (stories: StoryUser[]) => void;
  getCachedPosts?: () => Post[] | null;
  getCachedFriends?: () => Friend[] | null;
  getCachedStories?: () => StoryUser[] | null;
}

export function useFeed(options: UseFeedOptions) {
  const { userId, demoEnabled, onCachePosts, onCacheFriends, onCacheStories, getCachedPosts, getCachedFriends, getCachedStories } = options;
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: PostComment[] }>({});
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({});
  const [animatingLike, setAnimatingLike] = useState<string | null>(null);

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
      const { data: friendships } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted');

      if (friendships && friendships.length > 0) {
        const friendIds = friendships.map(f => f.friend_id);
        
        let profileQuery = supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', friendIds);

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
      console.error('Error fetching friends:', error);
      // Try cache on error
      const cached = getCachedFriends?.();
      if (cached) setFriends(cached);
    }
  }, [userId, demoEnabled, onCacheFriends, getCachedFriends]);

  const fetchPosts = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted');

      const friendIds = friendships?.map(f => f.friend_id) || [];
      const userIds = [userId, ...friendIds];

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
        .order('created_at', { ascending: false });

      if (demoEnabled) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        query = query.in('user_id', userIds).eq('is_demo', false);
      }

      const { data } = await query;

      const postsList = data || [];
      setPosts(postsList);
      onCachePosts?.(postsList);

      // Fetch user's likes for these posts
      if (postsList.length > 0) {
        const postIds = postsList.map(p => p.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('user_id', userId)
          .in('post_id', postIds);
        
        setLikedPosts(new Set(likes?.map(l => l.post_id) || []));
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      // Try cache on error
      const cached = getCachedPosts?.();
      if (cached) setPosts(cached);
    }
  }, [userId, demoEnabled, onCachePosts, getCachedPosts]);

  const fetchStories = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', userId)
        .eq('status', 'accepted');

      const friendIds = friendships?.map(f => f.friend_id) || [];
      const userIds = [userId, ...friendIds];

      let query = supabase
        .from('stories')
        .select(`
          id,
          user_id,
          profiles:user_id (
            display_name,
            avatar_url
          )
        `)
        .gt('expires_at', new Date().toISOString());

      if (demoEnabled) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        query = query.in('user_id', userIds).eq('is_demo', false);
      }

      const { data: stories } = await query;

      if (!stories) {
        setStoryUsers([]);
        return;
      }

      // Fetch story views for current user
      const storyIds = stories.map(s => s.id);
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('user_id', userId)
        .in('story_id', storyIds);

      const viewedStoryIds = new Set(views?.map(v => v.story_id) || []);

      // Group stories by user
      const userStoryMap = new Map<string, { profile: any; stories: any[]; hasUnviewed: boolean }>();

      stories.forEach(story => {
        const storyUserId = story.user_id;
        if (!userStoryMap.has(storyUserId)) {
          userStoryMap.set(storyUserId, {
            profile: story.profiles,
            stories: [],
            hasUnviewed: false,
          });
        }
        const userStory = userStoryMap.get(storyUserId)!;
        userStory.stories.push(story);
        if (!viewedStoryIds.has(story.id)) {
          userStory.hasUnviewed = true;
        }
      });

      const storyUsersList: StoryUser[] = [];
      userStoryMap.forEach((data, storyUserId) => {
        if (storyUserId !== userId) {
          storyUsersList.push({
            user_id: storyUserId,
            display_name: data.profile?.display_name || 'Unknown',
            avatar_url: data.profile?.avatar_url,
            has_unviewed: data.hasUnviewed,
            story_count: data.stories.length,
          });
        }
      });

      setStoryUsers(storyUsersList);
      onCacheStories?.(storyUsersList);
    } catch (error) {
      console.error('Error fetching stories:', error);
      // Try cache on error
      const cached = getCachedStories?.();
      if (cached) setStoryUsers(cached);
    }
  }, [userId, demoEnabled, onCacheStories, getCachedStories]);

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
    }
  }, []);

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

  const handlePostComment = useCallback(async (postId: string) => {
    const commentText = newComment[postId]?.trim();
    if (!commentText || !userId) return;

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      text: commentText,
    });

    if (error) {
      console.error('Error posting comment:', error);
      return;
    }

    setNewComment(prev => ({ ...prev, [postId]: '' }));
    await fetchComments(postId);
    await fetchPosts();
  }, [newComment, userId, fetchComments, fetchPosts]);

  const handleLikePost = useCallback(async (postId: string) => {
    if (!userId) return;

    const isLiked = likedPosts.has(postId);
    
    // Haptic feedback on like
    if (!isLiked) {
      haptic.light();
      setAnimatingLike(postId);
      setTimeout(() => setAnimatingLike(null), 500);
    }

    // Optimistic UI update
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          likes_count: isLiked ? Math.max((p.likes_count || 0) - 1, 0) : (p.likes_count || 0) + 1
        };
      }
      return p;
    }));

    if (isLiked) {
      setLikedPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });

      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error unliking post:', error);
        // Revert
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p));
        setLikedPosts(prev => new Set(prev).add(postId));
      }
    } else {
      setLikedPosts(prev => new Set(prev).add(postId));

      const { error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: userId });

      if (error) {
        console.error('Error liking post:', error);
        // Revert
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes_count: Math.max((p.likes_count || 0) - 1, 0) } : p));
        setLikedPosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
      }
    }
  }, [userId, likedPosts]);

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId);

    if (!error) {
      setPosts(prev => prev.filter(p => p.id !== postId));
    }
  }, [userId]);

  return {
    posts,
    setPosts,
    friends,
    storyUsers,
    likedPosts,
    expandedPostId,
    comments,
    newComment,
    setNewComment,
    animatingLike,
    getTimeAgo,
    fetchFriends,
    fetchPosts,
    fetchStories,
    fetchComments,
    handleToggleComments,
    handlePostComment,
    handleLikePost,
    handleDeletePost,
  };
}
