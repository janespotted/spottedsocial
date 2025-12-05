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
  city?: string; // 'nyc' | 'la' for filtering posts/stories by venue city
  onCachePosts?: (posts: Post[]) => void;
  onCacheFriends?: (friends: Friend[]) => void;
  onCacheStories?: (stories: StoryUser[]) => void;
  getCachedPosts?: () => Post[] | null;
  getCachedFriends?: () => Friend[] | null;
  getCachedStories?: () => StoryUser[] | null;
}

export function useFeed(options: UseFeedOptions) {
  const { userId, demoEnabled, city, onCachePosts, onCacheFriends, onCacheStories, getCachedPosts, getCachedFriends, getCachedStories } = options;
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: PostComment[] }>({});
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({});
  const [animatingLike, setAnimatingLike] = useState<string | null>(null);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());

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
      // Query both directions of friendships
      const [sentFriendships, receivedFriendships] = await Promise.all([
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
      ]);

      // Combine friend IDs from both directions
      const friendIds = [
        ...(sentFriendships.data?.map(f => f.friend_id) || []),
        ...(receivedFriendships.data?.map(f => f.user_id) || []),
      ];

      // Remove duplicates
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
      console.error('Error fetching friends:', error);
      // Try cache on error
      const cached = getCachedFriends?.();
      if (cached) setFriends(cached);
    }
  }, [userId, demoEnabled, onCacheFriends, getCachedFriends]);

  const fetchPosts = useCallback(async () => {
    if (!userId) return;

    try {
      // Parallelize: Get venues AND friendships at the same time
      const [cityVenuesResult, sentFriendships, receivedFriendships] = await Promise.all([
        supabase.from('venues').select('id, name').eq('city', city || 'nyc'),
        supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
        supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
      ]);
      
      const cityVenues = cityVenuesResult.data;
      const cityVenueIds = new Set(cityVenues?.map(v => v.id) || []);
      const cityVenueNames = new Set(cityVenues?.map(v => v.name.toLowerCase()) || []);

      // Combine friend IDs from both directions
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
        .order('created_at', { ascending: false });

      if (demoEnabled) {
        query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
      } else {
        query = query.in('user_id', userIds).eq('is_demo', false);
      }

      const { data } = await query;

      // Filter posts by city: include if venue matches OR no venue (general posts allowed)
      const filteredPosts = (data || []).filter(post => {
        // Include posts without venue info (general posts)
        if (!post.venue_id && !post.venue_name) return true;
        // If post has a venue_id that matches city venues, include it
        if (post.venue_id && cityVenueIds.has(post.venue_id)) return true;
        // If post has a venue_name that matches city venue names, include it
        if (post.venue_name && cityVenueNames.has(post.venue_name.toLowerCase())) return true;
        // Exclude posts from other cities
        return false;
      });

      setPosts(filteredPosts);
      onCachePosts?.(filteredPosts);

      // Fetch user's likes for these posts
      if (filteredPosts.length > 0) {
        const postIds = filteredPosts.map(p => p.id);
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
  }, [userId, demoEnabled, city, onCachePosts, getCachedPosts]);

  const fetchStories = useCallback(async () => {
    if (!userId) return;

    try {
      // Parallelize: Get venues AND friendships at the same time
      const [cityVenuesResult, sentFriendships, receivedFriendships] = await Promise.all([
        supabase.from('venues').select('id, name').eq('city', city || 'nyc'),
        supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
        supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
      ]);
      
      const cityVenues = cityVenuesResult.data;
      const cityVenueNames = new Set(cityVenues?.map(v => v.name.toLowerCase()) || []);

      // Combine friend IDs from both directions
      const friendIds = [
        ...(sentFriendships.data?.map(f => f.friend_id) || []),
        ...(receivedFriendships.data?.map(f => f.user_id) || []),
      ];
      const uniqueFriendIds = [...new Set(friendIds)];
      const userIds = [userId, ...uniqueFriendIds];

      let query = supabase
        .from('stories')
        .select(`
          id,
          user_id,
          venue_name,
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

      // Filter stories by city venue names
      const filteredStories = stories.filter(story => {
        if (!story.venue_name) return true; // Include stories without venue
        return cityVenueNames.has(story.venue_name.toLowerCase());
      });

      // Fetch story views for current user
      const storyIds = filteredStories.map(s => s.id);
      const { data: views } = storyIds.length > 0 ? await supabase
        .from('story_views')
        .select('story_id')
        .eq('user_id', userId)
        .in('story_id', storyIds) : { data: [] };

      const viewedStoryIds = new Set(views?.map(v => v.story_id) || []);

      // Group stories by user
      const userStoryMap = new Map<string, { profile: any; stories: any[]; hasUnviewed: boolean }>();

      filteredStories.forEach(story => {
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
  }, [userId, demoEnabled, city, onCacheStories, getCachedStories]);

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
      
      // Fetch user's comment likes for these comments
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

  const handleLikeComment = useCallback(async (commentId: string, postId: string) => {
    if (!userId) return;

    const isLiked = likedComments.has(commentId);
    
    // Haptic feedback on like
    if (!isLiked) {
      haptic.light();
    }

    // Optimistic UI update
    setComments(prev => ({
      ...prev,
      [postId]: prev[postId]?.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            likes_count: isLiked ? Math.max((c.likes_count || 0) - 1, 0) : (c.likes_count || 0) + 1
          };
        }
        return c;
      }) || []
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
        // Revert
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
        // Revert
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
    storyUsers,
    likedPosts,
    likedComments,
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
    handleLikeComment,
    handleDeletePost,
  };
}
