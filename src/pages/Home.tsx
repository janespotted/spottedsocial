import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { StoryViewer } from '@/components/StoryViewer';
import { CreateStoryDialog } from '@/components/CreateStoryDialog';
import { PostLikesModal } from '@/components/PostLikesModal';

interface Post {
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

interface PostComment {
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

interface Friend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface StoryUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  has_unviewed: boolean;
  story_count: number;
}

export default function Home() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();

  const handleVenueClick = async (venueName: string, venueId?: string | null) => {
    if (venueId) {
      openVenueCard(venueId);
      return;
    }

    // If no venue_id, look it up by name
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();

    if (data?.id) {
      openVenueCard(data.id);
    }
  };
  const demoEnabled = useDemoMode();
  useAutoVenueTracking(); // Trigger auto-venue tracking on home view
  const [posts, setPosts] = useState<Post[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [hasCheckedToday, setHasCheckedToday] = useState(false);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [selectedStoryUser, setSelectedStoryUser] = useState<string | null>(null);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [selectedPostForLikes, setSelectedPostForLikes] = useState<string | null>(null);
  const [animatingLike, setAnimatingLike] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<{ [key: string]: PostComment[] }>({});
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (user) {
      checkFirstLogin();
      fetchFriends();
      fetchPosts();
      fetchStories();
      subscribeToNewPosts();
      subscribeToNewStories();
      subscribeToLikes();
    }
  }, [user, demoEnabled]);

  const checkFirstLogin = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('updated_at')
      .eq('user_id', user?.id)
      .maybeSingle();

    if (!data) {
      openCheckIn();
      setHasCheckedToday(false);
    } else {
      const lastUpdate = new Date(data.updated_at);
      const today = new Date();
      const isToday = lastUpdate.toDateString() === today.toDateString();
      setHasCheckedToday(isToday);
      
      if (!isToday) {
        openCheckIn();
      }
    }
  };

  const fetchFriends = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (friendships && friendships.length > 0) {
      const friendIds = friendships.map(f => f.friend_id);
      
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);

      if (friendProfiles) {
        setFriends(friendProfiles.map(f => ({
          user_id: f.id,
          display_name: f.display_name,
          avatar_url: f.avatar_url,
        })));
      }
    }
  };

  const fetchPosts = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const friendIds = friendships?.map(f => f.friend_id) || [];
    const userIds = [user?.id, ...friendIds];

    // Build query for posts
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

    // If demo mode is enabled, include demo posts, otherwise filter by friends
    if (demoEnabled) {
      query = query.or(`user_id.in.(${userIds.join(',')}),is_demo.eq.true`);
    } else {
      query = query.in('user_id', userIds).eq('is_demo', false);
    }

    const { data } = await query;

    setPosts(data || []);
    
    // Fetch user's likes for these posts
    if (data && data.length > 0) {
      const postIds = data.map(p => p.id);
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', user?.id)
        .in('post_id', postIds);
      
      setLikedPosts(new Set(likes?.map(l => l.post_id) || []));
    }
  };

  const fetchStories = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const friendIds = friendships?.map(f => f.friend_id) || [];
    const userIds = [user?.id, ...friendIds];

    // Fetch stories
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
      .eq('user_id', user?.id)
      .in('story_id', storyIds);

    const viewedStoryIds = new Set(views?.map(v => v.story_id) || []);

    // Group stories by user
    const userStoryMap = new Map<string, { profile: any; stories: any[]; hasUnviewed: boolean }>();

    stories.forEach(story => {
      const userId = story.user_id;
      if (!userStoryMap.has(userId)) {
        userStoryMap.set(userId, {
          profile: story.profiles,
          stories: [],
          hasUnviewed: false,
        });
      }
      const userStory = userStoryMap.get(userId)!;
      userStory.stories.push(story);
      if (!viewedStoryIds.has(story.id)) {
        userStory.hasUnviewed = true;
      }
    });

    // Convert to array and add current user's story status
    const storyUsersList: StoryUser[] = [];

    // Add current user first if they have stories
    if (userStoryMap.has(user?.id!)) {
      const myStories = userStoryMap.get(user?.id!)!;
      storyUsersList.push({
        user_id: user?.id!,
        display_name: 'Your Story',
        avatar_url: myStories.profile?.avatar_url,
        has_unviewed: false,
        story_count: myStories.stories.length,
      });
      userStoryMap.delete(user?.id!);
    }

    // Add friends with stories
    userStoryMap.forEach((data, userId) => {
      storyUsersList.push({
        user_id: userId,
        display_name: data.profile?.display_name || 'Unknown',
        avatar_url: data.profile?.avatar_url,
        has_unviewed: data.hasUnviewed,
        story_count: data.stories.length,
      });
    });

    setStoryUsers(storyUsersList);
  };

  const subscribeToNewPosts = () => {
    const channel = supabase
      .channel('posts_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToNewStories = () => {
    const channel = supabase
      .channel('stories_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories',
        },
        () => {
          fetchStories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToLikes = () => {
    const channel = supabase
      .channel('likes_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getTimeAgo = (date: string) => {
    const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
    return distance
      .replace(/less than a minute|a few seconds/i, '1m')
      .replace('about ', '')
      .replace(' minutes', 'm').replace(' minute', 'm')
      .replace(' hours', 'h').replace(' hour', 'h')
      .replace(' days', 'd').replace(' day', 'd');
  };

  const fetchComments = async (postId: string) => {
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
  };

  const handleToggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
    } else {
      setExpandedPostId(postId);
      if (!comments[postId]) {
        await fetchComments(postId);
      }
    }
  };

  const handlePostComment = async (postId: string) => {
    const commentText = newComment[postId]?.trim();
    if (!commentText || !user) return;

    const { error } = await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: user.id,
      text: commentText,
    });

    if (error) {
      console.error('Error posting comment:', error);
      return;
    }

    // Clear input
    setNewComment(prev => ({ ...prev, [postId]: '' }));
    
    // Refresh comments and posts
    await fetchComments(postId);
    await fetchPosts();
  };

  const handleLikePost = async (postId: string) => {
    if (!user) return;

    const isLiked = likedPosts.has(postId);
    
    // Trigger animation
    if (!isLiked) {
      setAnimatingLike(postId);
      setTimeout(() => setAnimatingLike(null), 500);
    }

    // Optimistic UI update
    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.id === postId
          ? { ...post, likes_count: (post.likes_count || 0) + (isLiked ? -1 : 1) }
          : post
      )
    );

    if (isLiked) {
      // Unlike
      setLikedPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });

      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error unliking post:', error);
        // Revert optimistic update
        setPosts(prevPosts =>
          prevPosts.map(post =>
            post.id === postId
              ? { ...post, likes_count: (post.likes_count || 0) + 1 }
              : post
          )
        );
        setLikedPosts(prev => new Set(prev).add(postId));
        return;
      }
    } else {
      // Like
      setLikedPosts(prev => new Set(prev).add(postId));

      const { error } = await supabase
        .from('post_likes')
        .insert({
          post_id: postId,
          user_id: user.id,
        });

      if (error) {
        console.error('Error liking post:', error);
        // Revert optimistic update
        setPosts(prevPosts =>
          prevPosts.map(post =>
            post.id === postId
              ? { ...post, likes_count: (post.likes_count || 0) - 1 }
              : post
          )
        );
        setLikedPosts(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-light tracking-[0.3em] text-white mb-1">Spotted</h1>
            <h2 className="text-3xl font-bold text-white">Newsfeed</h2>
            <p className="text-white/60 text-sm mt-1">Everything disappears by 5am</p>
          </div>
          <button 
            onClick={openCheckIn}
            className="text-4xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
          >
            S
          </button>
        </div>

        {/* Stories Row */}
        <div className="pb-4 overflow-hidden">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide px-6">
            {/* Add Story Button */}
            <button
              onClick={() => setCreateStoryOpen(true)}
              className="flex-shrink-0 transition-transform hover:scale-105"
            >
              <div className="relative">
                <Avatar className="h-16 w-16 border-2 border-[#a855f7]/40">
                  <AvatarImage src={user?.user_metadata?.avatar_url} />
                  <AvatarFallback className="bg-[#1a0f2e] text-white">
                    {user?.user_metadata?.display_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 bg-[#a855f7] rounded-full p-1">
                  <Plus className="h-3 w-3 text-white" />
                </div>
              </div>
            </button>

            {/* Story Users */}
            {storyUsers.map((storyUser, idx) => (
              <button
                key={storyUser.user_id}
                onClick={() => setSelectedStoryUser(storyUser.user_id)}
                className="flex-shrink-0 transition-transform hover:scale-105"
              >
                <Avatar 
                  className={`h-16 w-16 border-2 ${
                    storyUser.has_unviewed 
                      ? 'border-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.8)]' 
                      : 'border-[#a855f7]/40'
                  }`}
                >
                  <AvatarImage src={storyUser.avatar_url || undefined} />
                  <AvatarFallback className="bg-[#1a0f2e] text-white">
                    {storyUser.display_name[0]}
                  </AvatarFallback>
                </Avatar>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="px-4 py-6 space-y-6">
        {posts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/60">No posts yet from friends</p>
            <p className="text-white/40 text-sm mt-2">Posts disappear by 5am</p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            >
              {/* Post Header */}
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openFriendCard({
                      userId: post.user_id,
                      displayName: post.profiles?.display_name || 'Friend',
                      avatarUrl: post.profiles?.avatar_url || null,
                      venueName: post.venue_name || undefined,
                    })}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="h-10 w-10 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                      <AvatarImage src={post.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {post.profiles?.display_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="text-left">
                    <button
                      onClick={() => openFriendCard({
                        userId: post.user_id,
                        displayName: post.profiles?.display_name || 'Friend',
                        avatarUrl: post.profiles?.avatar_url || null,
                        venueName: post.venue_name || undefined,
                      })}
                      className="font-semibold text-white hover:text-[#d4ff00] transition-colors"
                    >
                      {post.profiles?.display_name}
                    </button>
                    {post.venue_name && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVenueClick(post.venue_name!, post.venue_id);
                        }}
                        className="text-[#d4ff00] font-medium text-sm hover:text-[#d4ff00]/80 transition-colors block"
                      >
                        @{post.venue_name}
                      </button>
                    )}
                  </div>
                </div>
                <span className="text-white/60 text-sm">{getTimeAgo(post.created_at)}</span>
              </div>

              {/* Post Image */}
              {post.image_url && (
                <div className="w-full aspect-square">
                  <img
                    src={post.image_url}
                    alt="Post"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Post Actions */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleLikePost(post.id)}
                    className={`flex items-center gap-2 transition-all ${
                      likedPosts.has(post.id) 
                        ? 'text-[#d4ff00]' 
                        : 'text-white hover:text-[#d4ff00]'
                    } ${animatingLike === post.id ? 'animate-scale-in' : ''}`}
                  >
                    <Heart 
                      className={`h-6 w-6 ${animatingLike === post.id ? 'animate-scale-in' : ''}`}
                      fill={likedPosts.has(post.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button 
                    onClick={() => setSelectedPostForLikes(post.id)}
                    className="font-semibold text-white hover:text-[#d4ff00] transition-colors"
                  >
                    {post.likes_count || 0} {post.likes_count === 1 ? 'like' : 'likes'}
                  </button>
                  <button 
                    onClick={() => handleToggleComments(post.id)}
                    className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors"
                  >
                    <MessageCircle className="h-6 w-6" />
                    <span className="font-semibold">{post.comments_count || 0}</span>
                  </button>
                  <button className="text-white hover:text-[#d4ff00] transition-colors ml-auto">
                    <Send className="h-6 w-6" />
                  </button>
                </div>

                {/* Liked By */}
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {friends.slice(0, 3).map((friend, idx) => (
                      <Avatar key={idx} className="h-6 w-6 border-2 border-[#0a0118]">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="bg-[#1a0f2e] text-white text-xs">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="text-white/80 text-sm">
                    Liked by <span className="font-semibold">janelovespotted</span> and others
                  </p>
                </div>

                {/* Caption */}
                <div className="text-white/90 text-sm">
                  <button
                    onClick={() => openFriendCard({
                      userId: post.user_id,
                      displayName: post.profiles?.display_name || 'Friend',
                      avatarUrl: post.profiles?.avatar_url || null,
                      venueName: post.venue_name || undefined,
                    })}
                    className="font-semibold text-white hover:text-[#d4ff00] transition-colors"
                  >
                    {post.profiles?.username}
                  </button>{' '}
                  {post.text}
                </div>

                {/* Comments Section */}
                {expandedPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {/* Comments List */}
                    {comments[post.id]?.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={comment.profiles?.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                            {comment.profiles?.display_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="bg-[#1a0f2e]/60 rounded-lg px-3 py-2">
                            <p className="font-semibold text-white text-sm">
                              {comment.profiles?.display_name}
                            </p>
                            <p className="text-white/80 text-sm break-words">{comment.text}</p>
                          </div>
                          <p className="text-white/40 text-xs mt-1 ml-1">
                            {getTimeAgo(comment.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Add Comment Input */}
                    <div className="flex gap-2 items-end pt-2">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={user?.user_metadata?.avatar_url} />
                        <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                          {user?.email?.[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={newComment[post.id] || ''}
                          onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handlePostComment(post.id);
                            }
                          }}
                          placeholder="Add a comment..."
                          maxLength={500}
                          className="flex-1 bg-[#1a0f2e]/60 border border-white/10 rounded-full px-4 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#d4ff00]/40"
                        />
                        <button
                          onClick={() => handlePostComment(post.id)}
                          disabled={!newComment[post.id]?.trim()}
                          className="text-[#d4ff00] hover:text-[#d4ff00]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Story Viewer */}
      {selectedStoryUser && (
        <StoryViewer
          userId={selectedStoryUser}
          onClose={() => setSelectedStoryUser(null)}
          allStoryUsers={storyUsers.map(u => u.user_id)}
          currentUserIndex={storyUsers.findIndex(u => u.user_id === selectedStoryUser)}
        />
      )}

      {/* Create Story Dialog */}
      <CreateStoryDialog open={createStoryOpen} onOpenChange={setCreateStoryOpen} />

      {/* Post Likes Modal */}
      {selectedPostForLikes && (
        <PostLikesModal
          postId={selectedPostForLikes}
          isOpen={!!selectedPostForLikes}
          onClose={() => setSelectedPostForLikes(null)}
        />
      )}
    </div>
  );
}
