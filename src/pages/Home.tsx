import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { CreatePostFab } from '@/components/CreatePostFab';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useScreenGuard } from '@/hooks/useScreenGuard';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { haptic } from '@/lib/haptics';
import { useFeed, Post } from '@/hooks/useFeed';
import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useUserCity } from '@/hooks/useUserCity';
import { useDailyNudge } from '@/hooks/useDailyNudge';
import { useWeekendRally } from '@/hooks/useWeekendRally';
import { APP_BASE_URL, copyToClipboard } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, MessageSquare, Send, MoreHorizontal, Trash2, Loader2, Target, MapPin, Search, Bell, Volume2, VolumeX } from 'lucide-react';
import { CityBadge } from '@/components/CityBadge';
import { NotificationBadge } from '@/components/NotificationBadge';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { useMeetUp } from '@/contexts/MeetUpContext';
import { Button } from '@/components/ui/button';
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
import { PlansFeed } from '@/components/PlansFeed';
import { DailyNudgeModal } from '@/components/DailyNudgeModal';
import { NoFriendsBanner } from '@/components/NoFriendsBanner';
import { isNightlifeHours } from '@/lib/time-context';
import { UnifiedSearch } from '@/components/UnifiedSearch';
import { MorningAfterBanner } from '@/components/MorningAfterBanner';
import { FriendsOutPill } from '@/components/FriendsOutPill';
import { MorningAfterModal } from '@/components/MorningAfterModal';
import { MORNING_AFTER_FLAG } from '@/lib/morning-after-notification';
import { CommentsSheet } from '@/components/CommentsSheet';
import { ShareToDMModal } from '@/components/ShareToDMModal';

export default function Home() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { unreadCount } = useNotifications();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const { sendMeetUpNotification } = useMeetUp();
  const demoEnabled = useDemoMode();
  useScreenGuard();
  const { bootstrapEnabled } = useBootstrapMode();
  const navigate = useNavigate();
  const location = useLocation();
  const { city } = useUserCity();
  const { showNudgeModal, nudgeType, closeNudgeModal } = useDailyNudge();
  const { isWeekendRally, clearRally } = useWeekendRally();
  useAutoVenueTracking();

  // Admin triple-tap on "Spotted" wordmark
  const adminTapCount = useRef(0);
  const adminTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!user) return;
    supabase.rpc('has_role', { user_id: user.id, role: 'admin' })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user]);
  const handleWordmarkTap = () => {
    adminTapCount.current += 1;
    if (adminTapTimer.current) clearTimeout(adminTapTimer.current);
    if (adminTapCount.current >= 3) {
      adminTapCount.current = 0;
      if (isAdmin) {
        haptic.light();
        navigate('/demo-settings');
      }
      return;
    }
    adminTapTimer.current = setTimeout(() => { adminTapCount.current = 0; }, 500);
  };

  const { isOnline, cachePosts, getCachedPosts, cacheFriends, getCachedFriends } = useOfflineCache();

  const {
    posts,
    friends,
    likedPosts,
    likedComments,
    expandedPostId,
    setExpandedPostId,
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
    fetchComments,
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
  const clearPreselectedFriend = useCallback(() => setPlanPreselectedFriend(null), []);
  const loadTriggerRef = useRef<HTMLDivElement>(null);
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [feedAudioEnabled, setFeedAudioEnabled] = useState(false);

  // Sync mute state across all feed videos when toggled
  useEffect(() => {
    document.querySelectorAll<HTMLVideoElement>('video.feed-video').forEach(v => {
      v.muted = !feedAudioEnabled;
    });
  }, [feedAudioEnabled]);

  // Shared IntersectionObserver for autoplay videos
  const videoObserver = useMemo(() => {
    return new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const video = entry.target as HTMLVideoElement;
          if (entry.intersectionRatio >= 0.5) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.5, 1.0] }
    );
  }, []);

  // Auto-open Morning After modal if user tapped the recap notification
  useEffect(() => {
    if (localStorage.getItem(MORNING_AFTER_FLAG) === 'true') {
      localStorage.removeItem(MORNING_AFTER_FLAG);
      setShowMorningAfter(true);
    }
    const onVisibility = () => {
      if (!document.hidden && localStorage.getItem(MORNING_AFTER_FLAG) === 'true') {
        localStorage.removeItem(MORNING_AFTER_FLAG);
        setShowMorningAfter(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

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

      // Step 2: Get night_statuses + profiles via RPC
      // (direct profiles table is blocked by RLS for non-own profiles)
      const [statusResult, profileResult] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('user_id, venue_name, status, planning_neighborhood, is_demo, venue_id')
          .in('user_id', queryIds)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString()),
        supabase
          .rpc('get_profiles_safe'),
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

          // City filtering skipped — show all friends regardless of venue city

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
  }, [user?.id, demoEnabled, city]);

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

  // ── Collapsing header ──
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const root = document.getElementById('main-scroll');
    if (!root) return;

    const onScroll = () => {
      if (!tickingRef.current) {
        tickingRef.current = true;
        requestAnimationFrame(() => {
          const p = Math.min(1, Math.max(0, root.scrollTop / 72));
          // Only update state if value actually changed (avoids unnecessary re-renders)
          if (p !== scrollRef.current) {
            scrollRef.current = p;
            setScrollProgress(p);
          }
          tickingRef.current = false;
        });
      }
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => root.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="bg-gradient-to-b from-[#1a0f2e] to-[#110a24]">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-yellow-500/20 text-yellow-500 text-center py-2 text-sm">
          You're offline. Showing cached data.
        </div>
      )}

      {/* Header — sticky top bar + collapsing large-title tabs */}
      <div
        className="sticky top-0 z-10 pt-[max(env(safe-area-inset-top),12px)]"
        style={{
          backgroundColor: `rgba(26, 15, 46, ${0.92 + scrollProgress * 0.08})`,
          backdropFilter: `blur(${8 + scrollProgress * 8}px)`,
          WebkitBackdropFilter: `blur(${8 + scrollProgress * 8}px)`,
        }}
      >
        {/* Top bar — fixed size, does not resize */}
        <div className="flex items-center justify-between px-4 h-[40px]">
          <span
            className="text-white select-none cursor-pointer"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 300,
              fontSize: `${20 - scrollProgress * 2}px`,
              letterSpacing: '0.28em',
            }}
            onClick={handleWordmarkTap}
          >
            Spotted
          </span>

          <div className="flex items-center gap-2">
            <CityBadge />
            <button
              onClick={() => setShowFriendSearch(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors"
              aria-label="Search"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => navigate('/activity')}
              className="relative w-9 h-9 rounded-full bg-[#a855f7] text-white flex items-center justify-center hover:bg-[#a855f7]/90 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" />
              <NotificationBadge count={unreadCount} />
            </button>
            <button
              onClick={openCheckIn}
              className="hover:scale-110 transition-transform"
            >
              <img src={spottedLogo} alt="Go live" className="h-9 w-9 object-contain" />
            </button>
          </div>
        </div>

        {/* Tabs — large title that collapses on scroll */}
        <div
          className="flex items-end px-4"
          style={{
            paddingTop: `${12 - scrollProgress * 6}px`,
            paddingBottom: `${12 - scrollProgress * 6}px`,
            borderBottom: `1px solid rgba(255, 255, 255, ${0.04 + scrollProgress * 0.04})`,
          }}
        >
          {/* Newsfeed tab */}
          <button
            onClick={() => {
              setFeedMode('newsfeed');
              document.getElementById('main-scroll')?.scrollTo({ top: 0 });
            }}
            className="relative mr-6"
            style={{ transformOrigin: 'left bottom' }}
          >
            <span
              className="font-semibold text-white block"
              style={{
                fontSize: `${24 - scrollProgress * 11}px`,
                lineHeight: 1.2,
                opacity: feedMode === 'newsfeed' ? 1 : 0.4 + scrollProgress * 0.1,
              }}
            >
              Newsfeed
            </span>
            {feedMode === 'newsfeed' && (
              <div
                className="absolute left-0 right-0 bg-[#d4ff00] rounded-full"
                style={{
                  bottom: `${-2 - (12 - scrollProgress * 6)}px`,
                  height: `${2.5 - scrollProgress * 0.5}px`,
                }}
              />
            )}
          </button>

          {/* Plans tab */}
          <button
            onClick={() => {
              setFeedMode('plans');
              document.getElementById('main-scroll')?.scrollTo({ top: 0 });
            }}
            className="relative"
            style={{ transformOrigin: 'left bottom' }}
          >
            <span
              className="font-semibold text-white block"
              style={{
                fontSize: `${24 - scrollProgress * 11}px`,
                lineHeight: 1.2,
                opacity: feedMode === 'plans' ? 1 : 0.4 + scrollProgress * 0.1,
              }}
            >
              Plans
            </span>
            {feedMode === 'plans' && (
              <div
                className="absolute left-0 right-0 bg-[#d4ff00] rounded-full"
                style={{
                  bottom: `${-2 - (12 - scrollProgress * 6)}px`,
                  height: `${2.5 - scrollProgress * 0.5}px`,
                }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Morning After Banner */}
      <MorningAfterBanner onOpen={() => setShowMorningAfter(true)} />

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
            onPreselectedFriendConsumed={clearPreselectedFriend}
          />
        </div>
      ) : (
      <PullToRefresh onRefresh={async () => { await fetchPosts(); await fetchPlanningFriends(); }}>
        <div>
        
        
        {isLoading ? (
          <div className="px-4 py-4"><FeedSkeleton /></div>
        ) : posts.length === 0 ? (
          <div className="px-4 py-4 space-y-6">
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
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 pressable-row cursor-pointer"
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
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 pressable-row"
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
                      <button
                        onClick={() => navigate('/messages', {
                          state: {
                            preselectedUser: { id: friend.user_id, display_name: friend.display_name, avatar_url: friend.avatar_url },
                            source: 'planning'
                          }
                        })}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                      >
                        <MessageSquare className="w-5 h-5 text-white" />
                      </button>
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
              ref={(el) => { if (el) postRefs.current.set(post.id, el); else postRefs.current.delete(post.id); }}
              className="border-b border-white/[0.06]"
            >
              {/* Header — compact single row */}
              <div className="flex items-center px-4 py-3">
                <button
                  onClick={() => openFriendCard({
                    userId: post.user_id,
                    displayName: post.profiles?.display_name || 'Friend',
                    avatarUrl: post.profiles?.avatar_url || null,
                    venueName: post.venue_name || undefined,
                  })}
                  className="flex items-center gap-2.5 min-w-0 flex-1"
                >
                  <div className="w-8 h-8 rounded-full p-[1.5px] flex-shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #d4ff00)' }}>
                    <Avatar className="w-full h-full border-[1.5px] border-[#110a24]">
                      <AvatarImage src={post.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="bg-[#110a24] text-white text-xs">
                        {post.profiles?.display_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="font-semibold text-white text-sm truncate">
                    {post.profiles?.display_name}
                  </span>
                  {post.venue_name && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVenueClick(post.venue_name!, post.venue_id);
                      }}
                      className="text-[#d4ff00] text-xs font-medium truncate hover:underline"
                    >
                      @{post.venue_name}
                    </button>
                  )}
                </button>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-white/35 text-xs">{getTimeAgo(post.created_at)}</span>
                  {post.user_id === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-white/40 hover:text-white transition-colors p-1">
                          <MoreHorizontal className="h-4 w-4" />
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

              {/* Image/video — full bleed, 4:5 max */}
              {post.image_url && (
                <div
                  className="w-full relative overflow-hidden"
                  style={{ maxHeight: 'calc(100vw * 1.25)', aspectRatio: '4 / 5' }}
                >
                  {post.media_type === 'video' ? (
                    <div
                      className="relative w-full h-full"
                      onClick={() => setFeedAudioEnabled(prev => !prev)}
                    >
                      <video
                        ref={(el) => {
                          if (el) {
                            videoObserver.observe(el);
                            el.muted = !feedAudioEnabled;
                          }
                        }}
                        src={post.image_url}
                        muted
                        playsInline
                        loop
                        preload="metadata"
                        className="feed-video w-full h-full object-cover object-center"
                      />
                      <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
                        {feedAudioEnabled ? (
                          <Volume2 className="w-4 h-4 text-white" />
                        ) : (
                          <VolumeX className="w-4 h-4 text-white/70" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <img
                      src={post.image_url}
                      alt="Post"
                      className="w-full h-full object-cover object-center"
                      onError={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) parent.style.display = 'none';
                      }}
                    />
                  )}
                </div>
              )}

              {/* Action row + like count + caption — precise spacing */}
              <div className="px-4 pt-2 pb-3">
                {/* Text-only posts */}
                {!post.image_url && post.text && (
                  <div className="text-white text-[15px] leading-snug mb-2">
                    {post.text}
                  </div>
                )}

                {/* Action icons — 24px, 16px gaps */}
                <div className="flex items-center">
                  <button
                    onClick={() => handleLikePost(post.id)}
                    className={`transition-all active:scale-90 ${
                      likedPosts.has(post.id) ? 'text-[#d4ff00]' : 'text-white/80 hover:text-[#d4ff00]'
                    }`}
                  >
                    <Heart
                      className={`h-6 w-6 ${animatingLike === post.id ? 'animate-scale-in' : ''}`}
                      fill={likedPosts.has(post.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    onClick={() => { setExpandedPostId(post.id); }}
                    className="text-white/80 hover:text-[#d4ff00] transition-colors ml-4"
                  >
                    <MessageCircle className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => setSharePost(post)}
                    className="text-white/80 hover:text-[#d4ff00] transition-colors ml-4"
                  >
                    <Send className="h-6 w-6" />
                  </button>
                </div>

                {/* Like count — 13px semibold, hidden when 0 */}
                {(post.likes_count || 0) > 0 && (
                  <button
                    onClick={() => setSelectedPostForLikes(post.id)}
                    className="text-white font-semibold text-[13px] mt-1.5 hover:text-white/80 transition-colors block"
                  >
                    {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
                  </button>
                )}

                {/* Caption — username + text inline */}
                {post.image_url && post.text && (
                  <div className="text-[13px] leading-snug mt-1.5">
                    <button
                      onClick={() => openFriendCard({
                        userId: post.user_id,
                        displayName: post.profiles?.display_name || 'Friend',
                        avatarUrl: post.profiles?.avatar_url || null,
                        venueName: post.venue_name || undefined,
                      })}
                      className="font-semibold text-white hover:text-[#d4ff00] transition-colors mr-1"
                    >
                      {post.profiles?.display_name}
                    </button>
                    <span className="text-white/80">{post.text}</span>
                  </div>
                )}

                {/* View comments — hidden when 0 */}
                {(post.comments_count || 0) > 0 && (
                  <button
                    onClick={() => { setExpandedPostId(post.id); }}
                    className="text-white/40 text-[13px] mt-1 hover:text-white/60 transition-colors block"
                  >
                    View {post.comments_count === 1 ? '1 comment' : `all ${post.comments_count} comments`}
                  </button>
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


      {/* Comments bottom sheet */}
      <CommentsSheet
        open={!!expandedPostId}
        onOpenChange={(open) => { if (!open) setExpandedPostId(null); }}
        postId={expandedPostId}
        comments={comments}
        likedComments={likedComments}
        onPostComment={handlePostComment}
        onLikeComment={handleLikeComment}
        onFetchComments={fetchComments}
        getTimeAgo={getTimeAgo}
        userAvatarUrl={user?.user_metadata?.avatar_url}
        userInitial={user?.email?.[0]?.toUpperCase()}
      />

      {/* Create Post FAB — hides itself when the keyboard is open. Keyboard
          state lives inside the FAB so opening/closing the keyboard doesn't
          re-render the entire feed. */}
      <CreatePostFab
        visible={feedMode === 'newsfeed' && !expandedPostId && !showCreatePost}
        onClick={() => setShowCreatePost(true)}
      />

      {/* Friends Out Pill */}
      <FriendsOutPill />

      <CreatePostDialog open={showCreatePost} onOpenChange={(open) => { setShowCreatePost(open); if (!open) fetchPosts(); }} />

      <UnifiedSearch open={showFriendSearch} onOpenChange={setShowFriendSearch} />

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
