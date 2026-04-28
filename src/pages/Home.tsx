import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { useFeed, Post } from '@/hooks/useFeed';
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useUserCity } from '@/hooks/useUserCity';
import { useDailyNudge } from '@/hooks/useDailyNudge';
import { useWeekendRally } from '@/hooks/useWeekendRally';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Send, Plus, MoreHorizontal, Trash2, Loader2, Copy, Users, Target, MapPin, Search, Bell } from 'lucide-react';
import { CityBadge } from '@/components/CityBadge';
import { NotificationBadge } from '@/components/NotificationBadge';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { toast } from 'sonner';
import { PullToRefresh } from '@/components/PullToRefresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreatePostDialog } from '@/components/CreatePostDialog';
import { PostLikesModal } from '@/components/PostLikesModal';
import { FeedSkeleton } from '@/components/FeedSkeleton';
import { FriendsPlanning } from '@/components/FriendsPlanning';
import { PlansFeed } from '@/components/PlansFeed';
import { DailyNudgeModal } from '@/components/DailyNudgeModal';
import { NoFriendsBanner } from '@/components/NoFriendsBanner';
import { isNightlifeHours } from '@/lib/time-context';
import { FriendSearchModal } from '@/components/FriendSearchModal';
import { MorningAfterBanner } from '@/components/MorningAfterBanner';
import { FriendsOutPill } from '@/components/FriendsOutPill';
import { MorningAfterModal } from '@/components/MorningAfterModal';
import { CommentInput } from '@/components/CommentInput';
import { ShareToDMModal } from '@/components/ShareToDMModal';

export default function Home() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const { sendMeetUpNotification } = useMeetUp();
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const navigate = useNavigate();
  const location = useLocation();
  const { city } = useUserCity();
  const { showNudgeModal, nudgeType, closeNudgeModal } = useDailyNudge();
  const { isWeekendRally, clearRally } = useWeekendRally();
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
  const [showMorningAfter, setShowMorningAfter] = useState(false);
  const [selectedPostForLikes, setSelectedPostForLikes] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const [friendsOut, setFriendsOut] = useState<{ user_id: string; display_name: string; avatar_url: string | null; venue_name: string }[]>([]);
  const [feedMode, setFeedMode] = useState<'newsfeed' | 'plans'>(() => isNightlifeHours() ? 'newsfeed' : 'plans');
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [planPreselectedFriend, setPlanPreselectedFriend] = useState<{ id: string; display_name: string; avatar_url: string | null } | null>(null);
  const loadTriggerRef = useRef<HTMLDivElement>(null);

  // Handle navigation state (e.g., returning from DM to plans tab, or camera capture)
  useEffect(() => {
    const state = location.state as any;
    if (state?.feedMode) {
      setFeedMode(state.feedMode);
      if (state?.preselectedFriend) {
        setPlanPreselectedFriend(state.preselectedFriend);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
    if (state?.cameraCapture) {
      setShowCreatePost(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.key]);

  // Infinite scroll observer
  useEffect(() => {
    const el = loadTriggerRef.current;
    if (!el || feedMode !== 'newsfeed') return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMorePosts(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMorePosts, feedMode]);

  // Store fetch functions in refs to avoid dependency changes causing re-renders
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

  // Fetch friends out + planning — uses night_statuses joined with profiles directly
  // (not get_profiles_safe, which gates is_out behind can_see_location and can cause
  //  asymmetric visibility when friendship direction doesn't match the privacy check)
  const fetchPlanningFriends = async () => {
    if (!user) return;

    try {
      // Step 1: Get friend IDs (both directions)
      const [sentResult, receivedResult] = await Promise.all([
        supabase.from('friendships').select('friend_id').eq('user_id', user.id).eq('status', 'accepted'),
        supabase.from('friendships').select('user_id').eq('friend_id', user.id).eq('status', 'accepted'),
      ]);

      const friendIds = [
        ...(sentResult.data?.map(f => f.friend_id) || []),
        ...(receivedResult.data?.map(f => f.user_id) || []),
      ];

      const queryIds = [...new Set(friendIds)];
      if (queryIds.length === 0) {
        setPlanningFriends([]);
        setFriendsOut([]);
        return;
      }

      // Step 2: Get night_statuses + profiles via RPC (direct profiles table is
      // blocked by RLS for non-own profiles — must use get_profiles_safe)
      // Join with venues to get city so we can filter to current user's city
      const [statusResult, profileResult] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('user_id, venue_name, status, planning_neighborhood, is_demo, venue_id, venues(city)')
          .in('user_id', queryIds)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString()),
        supabase.rpc('get_profiles_safe'),
      ]);

      const statuses = statusResult.data;
      const profileMap = new Map(
        (profileResult.data || []).map((p: any) => [p.id, p])
      );

      // Step 3: Build results
      const planningResults: typeof planningFriends = [];
      const outResults: typeof friendsOut = [];

      if (statuses) {
        for (const s of statuses as any[]) {
          const profile = profileMap.get(s.user_id);

          // Filter out demo users when demo mode is off
          if (!demoEnabled && (s.is_demo || profile?.is_demo)) continue;

          // Filter to current city — skip friends at venues in other cities
          const venueCity = (s.venues as any)?.city;
          if (venueCity && venueCity !== city) continue;

          const displayName = profile?.display_name || 'Friend';
          const avatarUrl = profile?.avatar_url || null;

          if (s.status === 'planning') {
            planningResults.push({
              user_id: s.user_id,
              display_name: displayName,
              avatar_url: avatarUrl,
              planning_neighborhood: s.planning_neighborhood || null,
            });
          } else if (s.status === 'out' && s.venue_name) {
            outResults.push({
              user_id: s.user_id,
              display_name: displayName,
              avatar_url: avatarUrl,
              venue_name: s.venue_name,
            });
          }
        }
      }

      // Deduplicate: if a user appears in planning, remove from out
      const planningIds = new Set(planningResults.map(f => f.user_id));
      const dedupedOut = outResults.filter(f => !planningIds.has(f.user_id));

      setPlanningFriends(planningResults);
      setFriendsOut(dedupedOut);
    } catch (error) {
      console.error('Error fetching planning/out friends:', error);
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (user) {
      if (!hasFetchedOnce) setIsLoading(true);
      Promise.all([
        fetchFriendsRef.current(),
        fetchPostsRef.current(),
        fetchPlanningFriends(),
      ]).finally(() => {
        setIsLoading(false);
        setHasFetchedOnce(true);
      });
    }
  }, [user, demoEnabled, city]);

  // Auto-refresh when returning to the app / switching tabs
  useVisibilityRefresh(() => {
    if (user) {
      fetchFriendsRef.current();
      fetchPostsRef.current();
      fetchPlanningFriends();
    }
  });

  // Auto-switch to Plans tab when weekend rally is active
  useEffect(() => {
    if (isWeekendRally) {
      setFeedMode('plans');
    }
  }, [isWeekendRally]);

  // Handle new post incrementally
  const handleNewPost = useCallback((payload: any) => {
    // Only add if it's from the current user or a friend (validated on next refresh)
    console.log('📝 New post received via realtime');
  }, []);

  // Realtime subscriptions - use incremental handlers
  useRealtimeSubscriptions({
    onNewPost: handleIncrementalNewPost,
    onPostDeleted: handleIncrementalDelete,
    onNightStatusChange: fetchPlanningFriends,
  });

  const handlePostDelete = async (postId: string) => {
    await handleDeletePost(postId);
    toast.success('Post deleted');
  };

  // ── Collapsing header for Newsfeed ──
  const [scrollProgress, setScrollProgress] = useState(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const onScroll = () => {
      if (!tickingRef.current) {
        const scrollTop = root.scrollTop;
        requestAnimationFrame(() => {
          setScrollProgress(Math.min(1, Math.max(0, scrollTop / 80)));
          tickingRef.current = false;
        });
        tickingRef.current = true;
      }
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    // Set initial state
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f2e] to-[#110a24] pb-24">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-yellow-500/20 text-yellow-500 text-center py-2 text-sm">
          You're offline. Showing cached data.
        </div>
      )}

      {/* Header — collapsing on Newsfeed, static on Plans */}
      {feedMode === 'plans' ? (
        <PageHeader
          title="Plans"
          subtitle="What friends are up to"
          onSearchPress={() => setShowFriendSearch(true)}
        />
      ) : (
        <div
          className="sticky top-0 z-10 pt-[max(env(safe-area-inset-top),12px)]"
          style={{
            backgroundColor: scrollProgress > 0
              ? `rgba(26, 15, 46, ${0.95 + scrollProgress * 0.05})`
              : 'rgba(26, 15, 46, 0.95)',
            backdropFilter: scrollProgress > 0 ? `blur(${scrollProgress * 12}px)` : 'none',
            WebkitBackdropFilter: scrollProgress > 0 ? `blur(${scrollProgress * 12}px)` : 'none',
            borderBottom: `1px solid rgba(255, 255, 255, ${scrollProgress * 0.08})`,
          }}
        >
          <div className="flex items-start justify-between px-5 pt-3 pb-3">
            <div>
              {/* Wordmark row — anchored, no animation */}
              <div className="flex items-center gap-3 mb-1">
                <span
                  className="text-[30px] tracking-[0.35em] text-white select-none"
                  style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 300 }}
                >
                  Spotted
                </span>
                <CityBadge />
              </div>

              {/* Title — collapses */}
              <h2
                className="text-3xl font-bold text-white"
                style={{
                  transform: `scale(${1 - scrollProgress})`,
                  transformOrigin: 'left top',
                  opacity: 1 - scrollProgress,
                  height: `${(1 - scrollProgress) * 36}px`,
                  overflow: 'hidden',
                  transition: 'none',
                }}
              >
                Newsfeed
              </h2>

              {/* Tagline — fades fast */}
              <p
                className="text-white/50 text-sm mt-0.5 truncate"
                style={{
                  opacity: Math.max(0, 1 - scrollProgress * 3),
                  height: `${Math.max(0, 1 - scrollProgress * 2) * 20}px`,
                  overflow: 'hidden',
                  transition: 'none',
                }}
              >
                Everything disappears by 5am
              </p>
            </div>

            {/* Right: Actions — anchored, no animation */}
            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={() => setShowFriendSearch(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
                className="relative w-10 h-10 rounded-full bg-[#a855f7] text-white flex items-center justify-center hover:bg-[#a855f7]/90 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                <NotificationBadge count={unreadCount} />
              </button>
              <button
                onClick={openCheckIn}
                className="hover:scale-110 transition-transform"
              >
                <img src={spottedLogo} alt="Go live" className="h-12 w-12 object-contain" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Morning After Banner */}
      <MorningAfterBanner onOpen={() => setShowMorningAfter(true)} />

      {/* Feed Mode Toggle */}
      <div className="flex items-center justify-around px-5 pb-4">
        <button
          onClick={() => setFeedMode('newsfeed')}
          className={`relative pb-2 text-lg font-semibold transition-colors ${
            feedMode === 'newsfeed' ? 'text-white' : 'text-white/40'
          }`}
        >
          Newsfeed
          {feedMode === 'newsfeed' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
          )}
        </button>
        <button
          onClick={() => setFeedMode('plans')}
          className={`relative pb-2 text-lg font-semibold transition-colors ${
            feedMode === 'plans' ? 'text-white' : 'text-white/40'
          }`}
        >
          Plans
          {feedMode === 'plans' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4ff00]" />
          )}
        </button>
      </div>

      {/* No Friends Banner */}
      <NoFriendsBanner friendsCount={friends.length} />

      {/* Feed Content */}
      {feedMode === 'plans' ? (
        <div className="py-4">
          <PlansFeed
            userId={user?.id || ''}
            weekendFilter={isWeekendRally}
            onClearWeekendFilter={clearRally}
            preselectedFriend={planPreselectedFriend}
            onPreselectedFriendConsumed={() => setPlanPreselectedFriend(null)}
          />
        </div>
      ) : (
      <PullToRefresh onRefresh={async () => { await fetchPosts(); await fetchPlanningFriends(); }}>
        <div className="px-4 py-4 space-y-3">
        
        
        {isLoading ? (
          <FeedSkeleton />
        ) : posts.length === 0 ? (
          <div className="space-y-6">
            {/* Share CTA — always visible */}
            <div className="flex justify-center">
              <button
                onClick={() => setShowCreatePost(true)}
                className="bg-[#d4ff00] hover:bg-[#d4ff00]/90 text-[#1a0f2e] rounded-full px-6 py-2.5 font-medium transition-colors"
              >
                Share what you're up to
              </button>
            </div>

            {/* Out Tonight */}
            {friendsOut.length > 0 && (
              <div className="rounded-2xl overflow-hidden bg-[#1a0a2e]/80 border border-white/8 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#d4ff00]" />
                  <h3 className="text-white font-semibold text-sm">Out Tonight</h3>
                  <span className="text-white/40 text-xs">({friendsOut.length})</span>
                </div>
                <div className="space-y-2">
                  {friendsOut.map((friend) => (
                    <div
                      key={friend.user_id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => openFriendCard({
                        userId: friend.user_id,
                        displayName: friend.display_name,
                        avatarUrl: friend.avatar_url,
                        venueName: friend.venue_name,
                      })}
                    >
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-[#22c55e]/30 animate-pulse" style={{ transform: 'scale(1.2)' }} />
                        <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#22c55e] relative z-10">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#22c55e] text-white text-sm">
                            {friend.display_name?.[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                        <p className="text-[#d4ff00] text-xs truncate">{friend.venue_name}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); sendMeetUpNotification(friend.user_id, friend.display_name, friend.avatar_url); }}
                        className="h-8 px-3 bg-[#22c55e] hover:bg-[#22c55e]/80 text-white rounded-full text-xs transition-colors"
                      >
                        Meet Up
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Planning Tonight */}
            {planningFriends.length > 0 && (
              <div className="rounded-2xl overflow-hidden bg-[#1a0a2e]/80 border border-white/8 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#a855f7]" />
                  <h3 className="text-white font-semibold text-sm">Planning Tonight</h3>
                  <span className="text-white/40 text-xs">({planningFriends.length})</span>
                </div>
                <div className="space-y-2">
                  {planningFriends.map((friend) => (
                    <div
                      key={friend.user_id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-[#a855f7]/30 animate-pulse" style={{ transform: 'scale(1.2)' }} />
                        <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-white/20 relative z-10">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                            {friend.display_name?.[0] || '?'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{friend.display_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-white/50 text-xs">TBD tonight</span>
                          {friend.planning_neighborhood && (
                            <span className="text-xs bg-[#a855f7]/25 text-[#c084fc] px-2 py-0.5 rounded-full font-medium">
                              {friend.planning_neighborhood}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => navigate('/messages', {
                          state: {
                            preselectedUser: { id: friend.user_id, display_name: friend.display_name, avatar_url: friend.avatar_url },
                            source: 'planning'
                          }
                        })}
                        className="h-8 px-3 border border-white/20 text-white bg-transparent rounded-full text-xs hover:bg-white/10 transition-colors"
                      >
                        Make plans
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* True empty state — no friends out or planning */}
            {friendsOut.length === 0 && planningFriends.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-6">
                  <MessageCircle className="h-10 w-10 text-[#a855f7]/60" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  {(() => {
                    const hour = new Date().getHours();
                    if (hour < 12) return "Who's up?";
                    if (hour < 17) return "What's the move?";
                    if (hour < 21) return "Night's young";
                    return "Nothing here yet";
                  })()}
                </h3>
                <p className="text-white/50 text-sm">Share what you're up to</p>
              </div>
            )}
          </div>
        ) : (
          posts.map((post, index) => (
            <div
              key={post.id}
              className="rounded-3xl overflow-hidden bg-white/[0.03] border border-white/[0.06] post-animate-in transition-all duration-300 mb-3 p-3"
              style={{ animationDelay: `${index * 50}ms` }}
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
                    <Avatar className="h-10 w-10 border-2 border-white/20 ">
                      <AvatarImage src={post.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#1a0f2e] text-white">
                        {post.profiles?.display_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="text-left min-w-0 flex-1">
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
                <div className="w-full aspect-square relative overflow-hidden group image-vignette">
                  {post.media_type === 'video' ? (
                    <video
                      src={post.image_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={post.image_url}
                      alt="Post"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) parent.style.display = 'none';
                      }}
                    />
                  )}
                </div>
              )}

              <div className={!post.image_url ? "pt-1 px-4 pb-4 space-y-3" : "p-4 space-y-3"}>
                {/* Text-only posts - caption ABOVE engagement row */}
                {!post.image_url && post.text && (
                  <div className="text-white text-[17px] leading-relaxed font-medium">
                    {post.text}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => handleLikePost(post.id)}
                    className={`flex items-center gap-2 transition-all active:scale-90 ${
                      likedPosts.has(post.id) ? 'text-[#d4ff00]' : 'text-white hover:text-[#d4ff00]'
                    }`}
                  >
                    <Heart 
                      className={`h-6 w-6 transition-all ${
                        animatingLike === post.id ? 'animate-scale-in' : ''
                      } ${likedPosts.has(post.id) ? 'like-glow drop-shadow-[0_0_6px_rgba(212,255,0,0.6)]' : ''}`}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-white hover:text-[#d4ff00] transition-colors ml-auto">
                        <Send className="h-6 w-6" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#1a0f2e] border-[#4a3566]">
                      <DropdownMenuItem
                        onClick={() => setSharePost(post)}
                        className="text-white hover:bg-[#2d1b4e] cursor-pointer"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Send to Friend
                      </DropdownMenuItem>
                      <DropdownMenuItem
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
                        className="text-white hover:bg-[#2d1b4e] cursor-pointer"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Image posts with captions - Instagram style, BELOW engagement row */}
                {post.image_url && post.text && (
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
                      {post.profiles?.display_name}
                    </button>{' '}
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
                          <div className="bg-[#1a0f2e]/60 rounded-lg px-3 py-2">
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

                    <CommentInput
                      postId={post.id}
                      userAvatarUrl={user?.user_metadata?.avatar_url}
                      userInitial={user?.email?.[0].toUpperCase()}
                      onSubmit={handlePostComment}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
          {/* Infinite scroll trigger */}
          {feedMode === 'newsfeed' && posts.length > 0 && (
            <>
              <div ref={loadTriggerRef} className="h-1" />
              {isLoadingMore && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 text-[#a855f7] animate-spin" />
                </div>
              )}
              {!hasMorePosts && posts.length > 0 && (
                <p className="text-center text-white/30 text-sm py-4">No more posts</p>
              )}
            </>
          )}
        </div>
      </PullToRefresh>
      )}


      {/* Create Post FAB - only show in newsfeed mode */}
      {feedMode === 'newsfeed' && (
        <button
          onClick={() => setShowCreatePost(true)}
          className="fixed bottom-28 right-6 z-20 w-14 h-14 rounded-full bg-[#d4ff00] flex items-center justify-center hover:scale-105 transition-transform"
          aria-label="Create post"
        >
          <Plus className="h-7 w-7 text-black" />
        </button>
      )}

      {/* Friends Out Pill */}
      <FriendsOutPill />

      <CreatePostDialog open={showCreatePost} onOpenChange={(open) => { setShowCreatePost(open); if (!open) fetchPosts(); }} />

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />

      <MorningAfterModal open={showMorningAfter} onClose={() => setShowMorningAfter(false)} />

      {selectedPostForLikes && (
        <PostLikesModal
          postId={selectedPostForLikes}
          isOpen={!!selectedPostForLikes}
          onClose={() => setSelectedPostForLikes(null)}
        />
      )}

      {/* Daily Nudge Modal */}
      {showNudgeModal && nudgeType && (
        <DailyNudgeModal
          open={showNudgeModal}
          onClose={closeNudgeModal}
          nudgeType={nudgeType}
        />
      )}

      {/* Share to DM Modal */}
      <ShareToDMModal
        post={sharePost}
        open={!!sharePost}
        onOpenChange={(open) => !open && setSharePost(null)}
      />
    </div>
  );
}
