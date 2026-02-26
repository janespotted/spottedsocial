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
import { Heart, MessageCircle, Send, Plus, MoreHorizontal, Trash2, Bell, Search } from 'lucide-react';
import { FriendSearchModal } from '@/components/FriendSearchModal';
import { NotificationBadge } from '@/components/NotificationBadge';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { CreatePostDialog } from '@/components/CreatePostDialog';
import { PostLikesModal } from '@/components/PostLikesModal';
import { useDemoMode } from '@/hooks/useDemoMode';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import spottedLogo from '@/assets/spotted-s-logo.png';
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

  const { isOnline, cachePosts, getCachedPosts, cacheFriends, getCachedFriends } = useOfflineCache();

  const {
    posts,
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
    getCachedPosts,
    getCachedFriends,
  });

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [selectedPostForLikes, setSelectedPostForLikes] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  const fetchFriendsRef = useRef(fetchFriends);
  const fetchPostsRef = useRef(fetchPosts);

  useEffect(() => {
    fetchFriendsRef.current = fetchFriends;
    fetchPostsRef.current = fetchPosts;
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

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      fetchProfile();
      Promise.all([
        fetchFriendsRef.current(),
        fetchPostsRef.current(),
      ]).finally(() => setIsLoading(false));
    }
  }, [user, demoEnabled, city]);

  useRealtimeSubscriptions({
    onNewPost: handleIncrementalNewPost,
    onPostDeleted: handleIncrementalDelete,
  });

  const handlePostDelete = async (postId: string) => {
    await handleDeletePost(postId);
    toast.success('Post deleted');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
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
              onClick={() => setShowFriendSearch(true)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
              aria-label="Search friends"
            >
              <Search className="w-5 h-5" />
            </button>
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
      </div>

      {/* Posts Feed */}
      <PullToRefresh onRefresh={async () => { await fetchPosts(); }}>
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
                {!post.image_url && (
                  <p className="text-white text-base leading-relaxed">{post.text}</p>
                )}
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

                {post.image_url && (
                  <p className="text-white text-base leading-relaxed">{post.text}</p>
                )}

                {expandedPostId === post.id && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    {comments[post.id]?.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-2">
                        <button
                          onClick={() => openFriendCard({
                            userId: comment.user_id,
                            displayName: comment.profiles?.display_name || 'User',
                            avatarUrl: comment.profiles?.avatar_url || null,
                          })}
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={comment.profiles?.avatar_url || undefined} />
                            <AvatarFallback className="bg-[#2d1b4e] text-white text-xs">
                              {comment.profiles?.display_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <button
                              onClick={() => openFriendCard({
                                userId: comment.user_id,
                                displayName: comment.profiles?.display_name || 'User',
                                avatarUrl: comment.profiles?.avatar_url || null,
                              })}
                              className="font-semibold text-white hover:text-[#d4ff00] transition-colors"
                            >
                              {comment.profiles?.display_name}
                            </button>
                            <span className="text-white/80 ml-2">{comment.text}</span>
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-white/40 text-xs">{getTimeAgo(comment.created_at)}</span>
                            <button 
                              onClick={() => handleLikeComment(comment.id, post.id)}
                              className={`flex items-center gap-1 text-xs transition-colors ${
                                likedComments.has(comment.id) ? 'text-[#d4ff00]' : 'text-white/40 hover:text-white'
                              }`}
                            >
                              <Heart className="h-3 w-3" fill={likedComments.has(comment.id) ? 'currentColor' : 'none'} />
                              {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={newComment[post.id] || ''}
                        onChange={(e) => {
                          setNewComment(prev => ({ ...prev, [post.id]: e.target.value }));
                        }}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handlePostComment(post.id);
                        }}
                        placeholder="Add a comment..."
                        className="flex-1 bg-white/5 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/30 border border-white/10 focus:border-[#a855f7]/50 outline-none"
                      />
                      <button
                        onClick={() => handlePostComment(post.id)}
                        disabled={!newComment[post.id]?.trim()}
                        className="text-[#d4ff00] text-sm font-semibold disabled:opacity-30"
                      >
                        Post
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {posts.length > 0 && hasMorePosts && (
          <div className="flex justify-center py-4">
            <button
              onClick={loadMorePosts}
              disabled={isLoadingMore}
              className="px-6 py-2 rounded-full bg-[#a855f7]/20 text-[#a855f7] text-sm font-medium hover:bg-[#a855f7]/30 transition-colors disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
        </div>
      </PullToRefresh>

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

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
