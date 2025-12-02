import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useFeed } from '@/hooks/useFeed';
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useUserCity } from '@/hooks/useUserCity';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Plus, MoreHorizontal, Trash2, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { toast } from 'sonner';
import { PullToRefresh } from '@/components/PullToRefresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StoryViewer } from '@/components/StoryViewer';
import { CreateStoryDialog } from '@/components/CreateStoryDialog';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { PostLikesModal } from '@/components/PostLikesModal';
import { CityBadge } from '@/components/CityBadge';

export default function Home() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { city } = useUserCity();
  useAutoVenueTracking();

  const { isOnline, cachePosts, getCachedPosts, cacheFriends, getCachedFriends, cacheStories, getCachedStories } = useOfflineCache();

  const {
    posts,
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
    handleToggleComments,
    handlePostComment,
    handleLikePost,
    handleDeletePost,
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

  const [hasCheckedToday, setHasCheckedToday] = useState(false);
  const [selectedStoryUser, setSelectedStoryUser] = useState<string | null>(null);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [selectedPostForLikes, setSelectedPostForLikes] = useState<string | null>(null);

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

  const checkFirstLogin = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('night_statuses')
      .select('updated_at')
      .eq('user_id', user.id)
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
  }, [user, openCheckIn]);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      checkFirstLogin();
      fetchFriends();
      fetchPosts();
      fetchStories();
    }
  }, [user, demoEnabled, checkFirstLogin, fetchFriends, fetchPosts, fetchStories]);

  // Realtime subscriptions with proper cleanup
  useRealtimeSubscriptions({
    onPostsChange: fetchPosts,
    onStoriesChange: fetchStories,
    onLikesChange: fetchPosts,
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
        <div className="flex items-start justify-between p-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
              <CityBadge />
            </div>
            <h2 className="text-3xl font-bold text-white">Newsfeed</h2>
            <p className="text-white/60 text-sm mt-1">Everything disappears by 5am</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/notifications')}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full text-xs font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button 
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Check In" className="h-12 w-12 object-contain" />
            </button>
          </div>
        </div>

        {/* Stories Row */}
        <div className="pb-4 overflow-hidden">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide px-6">
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

            {storyUsers.map((storyUser) => (
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
      <PullToRefresh onRefresh={async () => { await fetchPosts(); await fetchStories(); }}>
        <div className="px-4 py-6 space-y-6">
        {posts.length === 0 ? (
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
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            >
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
                <div className="flex items-center gap-2">
                  <span className="text-white/60 text-sm">{getTimeAgo(post.created_at)}</span>
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

              {post.image_url && (
                <div className="w-full aspect-square">
                  <img src={post.image_url} alt="Post" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleLikePost(post.id)}
                    className={`flex items-center gap-2 transition-all ${
                      likedPosts.has(post.id) ? 'text-[#d4ff00]' : 'text-white hover:text-[#d4ff00]'
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
      </PullToRefresh>

      {selectedStoryUser && (
        <StoryViewer
          userId={selectedStoryUser}
          onClose={() => setSelectedStoryUser(null)}
          allStoryUsers={storyUsers.map(u => u.user_id)}
          currentUserIndex={storyUsers.findIndex(u => u.user_id === selectedStoryUser)}
        />
      )}

      <CreateStoryDialog open={createStoryOpen} onOpenChange={setCreateStoryOpen} />

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
