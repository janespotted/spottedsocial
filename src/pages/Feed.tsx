import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useInputFocus } from '@/contexts/InputFocusContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useFeed } from '@/hooks/useFeed';
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useUserCity } from '@/hooks/useUserCity';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Plus, MoreHorizontal, Trash2, Bell } from 'lucide-react';
import { NotificationBadge } from '@/components/NotificationBadge';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { CreatePostDialog } from '@/components/CreatePostDialog';
import { PostLikesModal } from '@/components/PostLikesModal';
import { useDemoMode } from '@/hooks/useDemoMode';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { StoryViewer } from '@/components/StoryViewer';
import { CreateStoryDialog } from '@/components/CreateStoryDialog';
import { toast } from 'sonner';
import { PullToRefresh } from '@/components/PullToRefresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CityBadge } from '@/components/CityBadge';
import { FeedSkeleton } from '@/components/FeedSkeleton';

export default function Feed() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { city } = useUserCity();
  const { setInputFocused } = useInputFocus();
  useAutoVenueTracking();

  const { isOnline, cachePosts, getCachedPosts, cacheFriends, getCachedFriends, cacheStories, getCachedStories } = useOfflineCache();

  const {
    posts,
    friends,
    storyUsers,
    userHasStory,
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
    fetchStories,
    handleToggleComments,
    handlePostComment,
    handleLikePost,
    handleLikeComment,
    handleDeletePost,
    loadMorePosts,
    handleIncrementalNewPost,
    handleIncrementalDelete,
  } = useFeed({
    userId: user?.id,
    demoEnabled,
    city,
    onCachePosts: cachePosts,
    onCacheFriends: cacheFriends,
    onCacheStories: cacheStories,
    getCachedPosts,
    getCachedFriends,
    getCachedStories,
  });

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [selectedStoryUser, setSelectedStoryUser] = useState<string | null>(null);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [selectedPostForLikes, setSelectedPostForLikes] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Store fetch functions in refs to avoid dependency changes causing re-renders
  const fetchFriendsRef = useRef(fetchFriends);
  const fetchPostsRef = useRef(fetchPosts);
  const fetchStoriesRef = useRef(fetchStories);

  useEffect(() => {
    fetchFriendsRef.current = fetchFriends;
    fetchPostsRef.current = fetchPosts;
    fetchStoriesRef.current = fetchStories;
  });

  const handleVenueClick = async (venueName: string, venueId?: string | null) => {
    if (venueId) {
      openVenueCard(venueId);
      return;
    }
    const { data } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();
    if (data?.id) {
      openVenueCard(data.id);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    setProfile(data);
  };

  // Initial data fetch - only depends on user and demoEnabled, not on callback functions
  useEffect(() => {
    if (user) {
      setIsLoading(true);
      fetchProfile();
      Promise.all([
        fetchFriendsRef.current(),
        fetchPostsRef.current(),
        fetchStoriesRef.current(),
      ]).finally(() => setIsLoading(false));
    }
  }, [user, demoEnabled, city]);

  // Realtime subscriptions - use incremental handlers
  useRealtimeSubscriptions({
    onNewPost: handleIncrementalNewPost,
    onPostDeleted: handleIncrementalDelete,
    onStoriesChange: fetchStories,
  });

  const handlePostDelete = async (postId: string) => {
    await handleDeletePost(postId);
    toast.success('Post deleted');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-yellow-500/20 text-yellow-500 text-center py-2 text-sm">
          You're offline. Showing cached data.
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-start justify-between px-6 pt-6 pb-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <CityBadge />
            </div>
            <h2 className="text-3xl font-bold text-white">Newsfeed</h2>
            <p className="text-white/50 text-sm mt-1">Everything disappears by 5am</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View activity"
            >
              <Bell className="w-5 h-5" />
              <NotificationBadge count={unreadCount} />
            </button>
            <button 
              onClick={openCheckIn} 
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-14 w-14 object-contain" />
            </button>
          </div>
        </div>

        {/* Stories Row */}
        <div className="py-4 overflow-hidden">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide px-6">
            {/* Your Story Button */}
            <button
              onClick={() => {
                if (userHasStory) {
                  setSelectedStoryUser(user?.id || null);
                } else {
                  setCreateStoryOpen(true);
                }
              }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 transition-all hover:scale-105"
            >
              <div className="relative">
                <div className={`p-[3px] rounded-full ${
                  userHasStory
                    ? 'bg-gradient-to-br from-[#d4ff00] via-[#a3e635] to-[#d4ff00] story-ring-active'
                    : 'bg-gradient-to-br from-[#a855f7]/60 to-[#a855f7]/20'
                }`}>
                  <div className="rounded-full bg-[#0a0118] p-[2px]">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {profile?.display_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                {!userHasStory && (
                  <div className="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-[#a855f7] to-[#7c3aed] rounded-full p-1.5 shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                    <Plus className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <span className="text-[10px] text-white/60 font-medium">Your Story</span>
            </button>

            {/* Friend Stories */}
            {storyUsers.map((storyUser) => (
              <button
                key={storyUser.user_id}
                onClick={() => setSelectedStoryUser(storyUser.user_id)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 transition-all hover:scale-105"
              >
                <div className={`p-[3px] rounded-full ${
                  storyUser.has_unviewed 
                    ? 'bg-gradient-to-br from-[#d4ff00] via-[#a3e635] to-[#d4ff00] story-ring-active' 
                    : 'bg-gradient-to-br from-[#a855f7]/40 to-[#a855f7]/20'
                }`}>
                  <div className="rounded-full bg-[#0a0118] p-[2px]">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={storyUser.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {storyUser.display_name[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                <span className="text-[10px] text-white/70 font-medium max-w-[60px] truncate">
                  {storyUser.display_name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      <PullToRefresh onRefresh={async () => { await fetchPosts(); await fetchStories(); }}>
        <div className="px-4 py-6 space-y-6">
        {isLoading ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6 border border-[#a855f7]/20">
              <MessageCircle className="h-10 w-10 text-[#a855f7]/60" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Your friends are quiet tonight
            </h3>
            <p className="text-white/50 text-sm max-w-xs">
              When they check in and post, their updates will appear here. Posts disappear by 5am.
            </p>
          </div>
        ) : (
          posts.map((post, index) => (
            <div
              key={post.id}
              className="glass-card rounded-3xl overflow-hidden post-animate-in transition-all duration-300 hover:shadow-[0_0_50px_rgba(168,85,247,0.3)]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {post.image_url && (
                <div className="w-full relative overflow-hidden group image-vignette">
                  <img
                    src={post.image_url}
                    alt="Post"
                    loading="lazy"
                    className="w-full h-80 object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between px-4 pt-4 pb-3">
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
                    <Avatar className="h-12 w-12 cursor-pointer">
                      <AvatarImage src={post.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#2d1b4e] text-white">
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
                      className="font-semibold text-white text-base hover:text-[#d4ff00] transition-colors"
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
                <div className="flex items-center gap-2">
                  <span className="text-white/50 text-sm">{getTimeAgo(post.created_at)}</span>
                  {post.user_id === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-white/50 hover:text-white transition-colors p-1">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#1a0f2e] border-[#4a3566]">
                        <DropdownMenuItem 
                          onClick={() => handlePostDelete(post.id)}
                          className="text-red-500 hover:text-red-400 focus:text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Post
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4 space-y-3">
                <div className="flex items-center gap-5">
                  <button 
                    onClick={() => handleLikePost(post.id)}
                    className={`flex items-center gap-2 transition-all active:scale-90 ${
                      likedPosts.has(post.id) ? 'text-[#d4ff00]' : 'text-white hover:text-[#d4ff00]'
                    }`}
                  >
                    <Heart 
                      className={`h-7 w-7 transition-all ${
                        animatingLike === post.id ? 'animate-scale-in' : ''
                      } ${likedPosts.has(post.id) ? 'like-glow drop-shadow-[0_0_6px_rgba(212,255,0,0.6)]' : ''}`}
                      fill={likedPosts.has(post.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button 
                    onClick={() => setSelectedPostForLikes(post.id)}
                    className="font-semibold text-base text-white hover:text-[#d4ff00] transition-colors"
                  >
                    {post.likes_count || 0} {post.likes_count === 1 ? 'like' : 'likes'}
                  </button>
                  <button 
                    onClick={() => handleToggleComments(post.id)}
                    className="flex items-center gap-2 text-white hover:text-[#d4ff00] transition-colors"
                  >
                    <MessageCircle className="h-7 w-7" />
                    <span className="font-semibold text-base">{post.comments_count || 0}</span>
                  </button>
                  <button 
                    onClick={async () => {
                      const shareData = {
                        title: `${post.profiles?.display_name} on Spotted`,
                        text: `${post.text}${post.venue_name ? ` @ ${post.venue_name}` : ''}`,
                        url: APP_BASE_URL,
                      };
                      if (navigator.share) {
                        try {
                          await navigator.share(shareData);
                        } catch (err) {
                          if ((err as Error).name !== 'AbortError') {
                            await copyToClipboard(`${shareData.text} - ${shareData.url}`);
                            toast.success('Link copied to clipboard!');
                          }
                        }
                      } else {
                        await copyToClipboard(`${shareData.text} - ${shareData.url}`);
                        toast.success('Link copied to clipboard!');
                      }
                    }}
                    className="text-white hover:text-[#d4ff00] transition-colors ml-auto"
                  >
                    <Send className="h-7 w-7" />
                  </button>
                </div>

                {(post.likes_count || 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {friends.slice(0, 3).map((friend, idx) => (
                        <Avatar key={idx} className="h-6 w-6 border-2 border-[#1a0f2e]">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                            {friend.display_name[0]}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    <p className="text-white text-sm">
                      Liked by <span className="font-semibold">{post.likes_count === 1 ? 'a friend' : `${post.likes_count} friends`}</span>
                    </p>
                  </div>
                )}

                {/* Image posts with captions - Instagram style */}
                {post.image_url && post.text && (
                  <div className="text-white/90 text-sm leading-relaxed">
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
                    </button>{' '}
                    {post.text}
                  </div>
                )}

                {/* Text-only posts - clean display without redundant username */}
                {!post.image_url && post.text && (
                  <div className="text-white text-base leading-relaxed">
                    {post.text}
                  </div>
                )}

                {expandedPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {comments[post.id]?.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={comment.profiles?.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                            {comment.profiles?.display_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="bg-[#0a0118]/60 rounded-lg px-3 py-2">
                            <p className="font-semibold text-white text-sm">
                              {comment.profiles?.display_name}
                            </p>
                            <p className="text-white/80 text-sm break-words">{comment.text}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 ml-1">
                            <span className="text-white/40 text-xs">{getTimeAgo(comment.created_at)}</span>
                            <button 
                              onClick={() => handleLikeComment(comment.id, post.id)}
                              className={`flex items-center gap-1 transition-colors ${
                                likedComments.has(comment.id) ? 'text-[#d4ff00]' : 'text-white/50 hover:text-[#d4ff00]'
                              }`}
                            >
                              <Heart 
                                className="h-3.5 w-3.5"
                                fill={likedComments.has(comment.id) ? 'currentColor' : 'none'}
                              />
                              {(comment.likes_count || 0) > 0 && (
                                <span className="text-xs">{comment.likes_count}</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 items-end pt-2">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={friends.find(f => f.user_id === user?.id)?.avatar_url || undefined} />
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
                          onFocus={(e) => {
                            setInputFocused(true);
                            setTimeout(() => {
                              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 300);
                          }}
                          onBlur={() => setInputFocused(false)}
                          placeholder="Add a comment..."
                          maxLength={500}
                          className="flex-1 bg-[#0a0118]/60 border border-white/10 rounded-full px-4 py-2 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#d4ff00]/40"
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
      </PullToRefresh>

      {/* Floating Create Post Button */}
      <div className="fixed bottom-24 right-0 left-0 z-20 flex justify-end px-6 pointer-events-none max-w-[430px] mx-auto">
        <button
          onClick={() => setShowCreatePost(true)}
          className="h-12 w-12 rounded-full bg-[#d4ff00] shadow-[0_0_30px_rgba(212,255,0,0.8)] hover:scale-110 transition-transform flex items-center justify-center pointer-events-auto"
        >
          <Plus className="h-6 w-6 text-[#1a0f2e]" />
        </button>
      </div>

      <CreatePostDialog open={showCreatePost} onOpenChange={setShowCreatePost} />

      {selectedStoryUser && (
        <StoryViewer
          userId={selectedStoryUser}
          onClose={() => setSelectedStoryUser(null)}
          allStoryUsers={
            selectedStoryUser === user?.id && userHasStory
              ? [user.id, ...storyUsers.map(u => u.user_id)]
              : storyUsers.map(u => u.user_id)
          }
          currentUserIndex={
            selectedStoryUser === user?.id && userHasStory
              ? 0
              : storyUsers.findIndex(u => u.user_id === selectedStoryUser)
          }
        />
      )}

      <CreateStoryDialog open={createStoryOpen} onOpenChange={setCreateStoryOpen} />

      {/* Create Post FAB */}
      <button
        onClick={() => setShowCreatePost(true)}
        className="fixed bottom-28 right-6 z-20 w-14 h-14 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.6)] hover:scale-110 transition-transform"
        aria-label="Create post"
      >
        <Plus className="h-7 w-7 text-white" />
      </button>

      <CreatePostDialog open={showCreatePost} onOpenChange={setShowCreatePost} />

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
