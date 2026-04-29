import { useEffect, useState, useRef, useCallback } from 'react';
import { PullToRefresh } from '@/components/PullToRefresh';
import { cn } from '@/lib/utils';
import { APP_BASE_URL, getShareableUrl, copyToClipboard } from '@/lib/platform';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { FriendsOutPill } from '@/components/FriendsOutPill';
import { MapPin, Users, Share2, Settings, LogOut, Bookmark, Bell, ChevronRight, Home, Target, UserPlus, QrCode, Camera, Search, Heart, MessageCircle } from 'lucide-react';
import { FriendSearchModal } from '@/components/FriendSearchModal';
import { InviteFriendsSection } from '@/components/InviteFriendsSection';
import { QRCodeModal } from '@/components/QRCodeModal';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProfileSkeleton } from '@/components/ProfileSkeleton';
import { QuickStatusSheet } from '@/components/QuickStatusSheet';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useFriendIds } from '@/hooks/useFriendIds';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { getVenuePhotoUrl } from '@/lib/venue-photo-url';


interface WishlistPlace {
  id: string;
  venue_name: string;
  venue_image_url: string | null;
}

interface RecentSpot {
  venue_id: string;
  venue_name: string;
  venue_image_url: string | null;
  visited_at: string;
}

interface UserPost {
  id: string;
  image_url: string | null;
  media_type: string | null;
  text: string;
  created_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  venue_name: string | null;
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { unreadCount } = useNotifications();
  
  useAutoVenueTracking(); // Trigger auto-venue tracking on profile view
  const navigate = useNavigate();
  const demoEnabled = useDemoMode();
  const { data: friendIds } = useFriendIds(user?.id);
  const { data: allProfiles } = useProfilesSafe();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [placesCount, setPlacesCount] = useState(0);
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [locationSharingLevel, setLocationSharingLevel] = useState('all_friends');
  const [wishlistPlaces, setWishlistPlaces] = useState<WishlistPlace[]>([]);
  const [recentSpots, setRecentSpots] = useState<RecentSpot[]>([]);
  const [spotsView, setSpotsView] = useState<'recent' | 'wishlist' | 'posts'>('recent');
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [currentStatus, setCurrentStatus] = useState<'out' | 'planning' | 'home' | null>(null);
  const [currentVenue, setCurrentVenue] = useState<string | null>(null);
  const [planningNeighborhood, setPlanningNeighborhood] = useState<string | null>(null);
  const [venueNeighborhood, setVenueNeighborhood] = useState<string | null>(null);
  const [planningVisibility, setPlanningVisibility] = useState<string | null>(null);
  const [isPrivateParty, setIsPrivateParty] = useState(false);
  const [partyNeighborhood, setPartyNeighborhood] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showQuickStatus, setShowQuickStatus] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  

  useEffect(() => {
    if (user) {
      fetchProfileData();
    }
  }, [user]);

  const getInviteUrl = () => `${APP_BASE_URL}/invite/${inviteCode}`;

  // Realtime subscription for night_statuses changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('profile-night-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'night_statuses',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchProfileData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Refetch night status on window focus (lightweight, avoids full re-fetch)
  const refreshNightStatus = useCallback(async () => {
    if (!user?.id) return;
    const { data: nightStatus } = await supabase
      .from('night_statuses')
      .select('status, venue_name, venue_id, planning_neighborhood, planning_visibility, is_private_party, party_neighborhood')
      .eq('user_id', user.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (nightStatus) {
      setCurrentStatus(nightStatus.status as 'out' | 'planning' | 'home');
      setCurrentVenue(nightStatus.venue_name);
      setPlanningNeighborhood(nightStatus.planning_neighborhood);
      setPlanningVisibility(nightStatus.planning_visibility || null);
      setIsPrivateParty(nightStatus.is_private_party || false);
      setPartyNeighborhood(nightStatus.party_neighborhood);
      setIsLocationSharing(nightStatus.status === 'out' && (!!nightStatus.venue_name || nightStatus.is_private_party));
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
      setPlanningVisibility(null);
      setIsPrivateParty(false);
      setPartyNeighborhood(null);
      setIsLocationSharing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const handleFocus = () => { refreshNightStatus(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshNightStatus]);

  const fetchProfileData = async () => {
    if (!hasFetchedOnce) setLoading(true);

    // Batch 1: All independent queries in parallel
    const [
      profileResult,
      nightStatusResult,
      sentFriendshipsResult,
      receivedFriendshipsResult,
      checkinsCountResult,
      recentCheckinsResult,
      wishlistResult,
      postsResult,
      inviteCodeResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, bio, created_at, is_demo, location_sharing_level')
        .eq('id', user?.id)
        .single(),
      supabase
        .from('night_statuses')
        .select('status, venue_name, venue_id, planning_neighborhood, planning_visibility, is_private_party, party_neighborhood')
        .eq('user_id', user?.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
      supabase
        .from('friendships')
        .select('id')
        .eq('user_id', user?.id)
        .eq('status', 'accepted'),
      supabase
        .from('friendships')
        .select('id')
        .eq('friend_id', user?.id)
        .eq('status', 'accepted'),
      supabase
        .from('checkins')
        .select('venue_name, started_at')
        .eq('user_id', user?.id),
      supabase
        .from('checkins')
        .select('venue_id, venue_name, created_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('wishlist_places')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('posts')
        .select('id, image_url, text, created_at, likes_count, comments_count, venue_name')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('invite_codes')
        .select('code')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Process profile
    const profileData = profileResult.data;
    if (profileData) {
      setProfile(profileData);
      setLocationSharingLevel(profileData.location_sharing_level || 'all_friends');
    }

    // Process invite code
    if (inviteCodeResult.data) {
      setInviteCode(inviteCodeResult.data.code);
    }

    // Process friends count — filter out demo users when demo mode is off
    const rawCount = (sentFriendshipsResult.data?.length || 0) + (receivedFriendshipsResult.data?.length || 0);
    if (!demoEnabled && friendIds && allProfiles) {
      const demoProfileIds = new Set(allProfiles.filter((p: any) => p.is_demo).map((p: any) => p.id));
      const realFriendCount = friendIds.filter(id => !demoProfileIds.has(id)).length;
      setFriendsCount(realFriendCount);
    } else {
      setFriendsCount(rawCount);
    }

    // Process places count
    const uniqueVenues = new Set(checkinsCountResult.data?.map(c => c.venue_name));
    setPlacesCount(uniqueVenues.size);

    // Weekly check-in count
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thisWeek = (checkinsCountResult.data || []).filter(c => c.started_at && c.started_at > oneWeekAgo);
    setWeeklyCount(thisWeek.length);

    // Process wishlist
    setWishlistPlaces(wishlistResult.data || []);

    // Process night status
    const nightStatus = nightStatusResult.data;
    if (nightStatus) {
      setCurrentStatus(nightStatus.status as 'out' | 'planning' | 'home');
      setCurrentVenue(nightStatus.venue_name);
      setPlanningNeighborhood(nightStatus.planning_neighborhood);
      setPlanningVisibility(nightStatus.planning_visibility || null);
      setIsPrivateParty(nightStatus.is_private_party || false);
      setPartyNeighborhood(nightStatus.party_neighborhood);
      setIsLocationSharing(nightStatus.status === 'out' && (!!nightStatus.venue_name || nightStatus.is_private_party));
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
      setPlanningVisibility(null);
      setVenueNeighborhood(null);
      setIsPrivateParty(false);
      setPartyNeighborhood(null);
      setIsLocationSharing(false);
    }

    // Process recent spots (unique venues)
    const seenVenues = new Set<string>();
    const uniqueRecentSpots: RecentSpot[] = [];
    for (const checkin of recentCheckinsResult.data || []) {
      if (checkin.venue_id && !seenVenues.has(checkin.venue_id)) {
        seenVenues.add(checkin.venue_id);
        uniqueRecentSpots.push({
          venue_id: checkin.venue_id,
          venue_name: checkin.venue_name,
          venue_image_url: null,
          visited_at: checkin.created_at || ''
        });
        if (uniqueRecentSpots.length >= 6) break;
      }
    }

    // Batch 2: Dependent queries in parallel
    const venueIds = uniqueRecentSpots.map(s => s.venue_id).filter(Boolean);
    const { resolvePostImageUrls } = await import('@/lib/storage-utils');

    const [venueNeighborhoodResult, venueImagesResult, resolvedPosts] = await Promise.all([
      // Venue neighborhood (depends on nightStatus)
      nightStatus?.status === 'out' && nightStatus.venue_id
        ? supabase.from('venues').select('neighborhood').eq('id', nightStatus.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Venue images (depends on recentCheckins)
      venueIds.length > 0
        ? supabase.from('venues').select('id, google_photo_refs').in('id', venueIds)
        : Promise.resolve({ data: null }),
      // Resolve post image URLs (depends on posts)
      resolvePostImageUrls(postsResult.data || []),
    ]);

    // Apply venue neighborhood
    if (nightStatus) {
      setVenueNeighborhood(venueNeighborhoodResult.data?.neighborhood || null);
    }

    // Apply venue images to recent spots
    if (venueImagesResult.data) {
      const imageMap = new Map<string, string | null>(
        venueImagesResult.data.map(v => {
          const refs = v.google_photo_refs as string[] | null;
          // Use proxy URL for first photo instead of raw ref/URL
          return [v.id, refs && refs.length > 0 ? getVenuePhotoUrl(v.id, 0) : null] as [string, string | null];
        })
      );
      for (const spot of uniqueRecentSpots) {
        spot.venue_image_url = imageMap.get(spot.venue_id) || null;
      }
    }

    setRecentSpots(uniqueRecentSpots);
    setUserPosts(resolvedPosts);
    setLoading(false);
    setHasFetchedOnce(true);
  };

  const handleLocationSharingChange = async (value: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ location_sharing_level: value })
        .eq('id', user?.id);

      if (error) throw error;

      setLocationSharingLevel(value);
      
      // Refresh profile data to sync state
      await fetchProfileData();
      
      toast.success(`Now sharing with ${getLevelDisplayName(value)}`);
    } catch (error: any) {
      toast.error('Failed to update location sharing');
    }
  };

  const handlePlanningVisibilityChange = async (value: string) => {
    try {
      const { error } = await supabase
        .from('night_statuses')
        .update({ planning_visibility: value, updated_at: new Date().toISOString() })
        .eq('user_id', user?.id);

      if (error) throw error;

      setPlanningVisibility(value);
      toast.success(`Planning visible to ${getLevelDisplayName(value)}`);
    } catch (error: any) {
      toast.error('Failed to update planning visibility');
    }
  };

  const handleShareProfile = async () => {
    const profileUrl = getShareableUrl(`/profile/${profile?.username}`);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Spotted Profile',
          text: `Check out @${profile?.username} on Spotted!`,
          url: profileUrl,
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      await copyToClipboard(profileUrl);
      toast.success('Profile link copied to clipboard!');
    }
  };

  const getLevelDisplayName = (level: string) => {
    switch (level) {
      case 'close_friends':
        return 'Close Friends';
      case 'mutual_friends':
        return 'Mutual Friends';
      case 'all_friends':
        return 'All Friends';
      default:
        return 'All Friends';
    }
  };


  const mockVenueImages = [
    'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=400',
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=400',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400',
    'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400',
    'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400',
    'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=400',
  ];

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <PullToRefresh onRefresh={fetchProfileData}>
    <div className="min-h-screen bg-gradient-to-b from-[#1a0f2e] to-[#110a24] pb-24">
      {/* Header */}
      <PageHeader
        title=""
        subtitle={`@${profile?.username || user?.email?.split('@')[0] || 'profile'}`}
        onSearchPress={() => setShowFriendSearch(true)}
        enableAdminGesture
      />

      {/* Friends Out Pill */}
      <FriendsOutPill />

      {/* Content */}
      <div className="px-4 py-5 space-y-5">
        {/* Avatar + Name + Username */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/profile/edit')} className="cursor-pointer flex-shrink-0">
            <div className="relative h-14 w-14 rounded-full border border-[#d4ff00]/30 overflow-hidden bg-[#261B4A] flex items-center justify-center">
              {(profile?.avatar_url || allProfiles?.find((p: any) => p.id === user?.id)?.avatar_url || user?.user_metadata?.avatar_url) ? (
                <img
                  src={profile?.avatar_url || allProfiles?.find((p: any) => p.id === user?.id)?.avatar_url || user?.user_metadata?.avatar_url}
                  alt={profile?.display_name || 'Profile'}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-[#d4ff00] text-xl font-medium">
                  {profile?.display_name?.[0] || user?.user_metadata?.display_name?.[0] || 'U'}
                </span>
              )}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-white truncate">
              {profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.full_name || 'User'}
            </h2>
            <p className="text-sm text-white/55 truncate">
              @{profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'username'}
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 text-sm text-white/65">
          <span><span className="text-white font-medium">{placesCount}</span> spots</span>
          <span className="text-white/25">·</span>
          <span><span className="text-white font-medium">{friendsCount}</span> friends</span>
          <span className="text-white/25">·</span>
          <span><span className="text-white font-medium">{weeklyCount || 0}</span> this week</span>
        </div>

        {/* Action Buttons — Edit / Share / Settings */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/profile/edit')}
            className="flex-1 border border-white/20 text-white text-sm font-medium py-2.5 rounded-full hover:bg-white/5 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleShareProfile}
            className="flex-1 border border-white/20 text-white text-sm font-medium py-2.5 rounded-full hover:bg-white/5 transition-colors"
          >
            Share
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-10 border border-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {/* Admin: Demo Mode + Camera Test */}
        {user?.email === 'jane.reynolds752@gmail.com' && (
          <div className="space-y-2">
            <button
              onClick={() => navigate('/demo-settings')}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-white/50 text-sm">Demo Mode</span>
              <span className="text-white/30 text-xs">Admin</span>
            </button>
          </div>
        )}

        {/* Tonight Status Card */}
        <div className="bg-[#1F1740] border border-[#d4ff00]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4ff00]" />
              <span className="text-[11px] text-white/60 uppercase tracking-wider">Tonight</span>
            </div>
            <span className="text-[11px] text-white/45">
              {currentStatus === 'out' ? 'Visible to all friends' : currentStatus === 'planning' ? 'TBD' : 'Not sharing'}
            </span>
          </div>

          {currentStatus === 'out' ? (
            <>
              <p className="text-lg font-medium text-white mb-1">
                Out at {isPrivateParty ? (currentVenue || 'Private Party') : (currentVenue || 'Unknown')}
              </p>
              <p className="text-xs text-white/55 mb-3.5">
                {partyNeighborhood || planningNeighborhood || ''}{partyNeighborhood || planningNeighborhood ? ' · ' : ''}Live now
              </p>
            </>
          ) : currentStatus === 'planning' ? (
            <>
              <p className="text-lg font-medium text-white mb-1">
                TBD{planningNeighborhood ? ` · ${planningNeighborhood}` : ''}
              </p>
              <p className="text-xs text-white/55 mb-3.5">Looking for plans</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-white mb-1">Not out tonight</p>
              <p className="text-xs text-white/55 mb-3.5">Tap to change your status</p>
            </>
          )}

          <div className="flex gap-2">
            <button
              onClick={openCheckIn}
              className="flex-1 bg-[#d4ff00] text-[#15102E] font-medium text-sm py-2.5 rounded-full"
            >
              Change status
            </button>
          </div>
        </div>

        {/* Spots Section with Dropdown */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
            <Select value={spotsView} onValueChange={(v) => setSpotsView(v as 'recent' | 'wishlist' | 'posts')}>
                <SelectTrigger className="border-none bg-transparent p-0 h-auto text-xl font-bold text-white gap-2 focus:ring-0 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
                  <SelectItem value="recent" className="text-white hover:bg-white/10 focus:bg-white/10 focus:text-white">
                    Recent Spots
                  </SelectItem>
                  <SelectItem value="wishlist" className="text-white hover:bg-white/10 focus:bg-white/10 focus:text-white">
                    Wishlist
                  </SelectItem>
                  <SelectItem value="posts" className="text-white hover:bg-white/10 focus:bg-white/10 focus:text-white">
                    Your Posts
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-white/60 text-sm">Only you can see</p>
            </div>
          </div>

          {/* Content based on dropdown selection */}
          {spotsView === 'recent' ? (
            recentSpots.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {recentSpots.map((spot, idx) => (
                  <div key={spot.venue_id} className="space-y-2">
                    <div 
                      className="aspect-square rounded-xl overflow-hidden bg-[#1a0a2e] border border-white/8"
                      style={{
                        backgroundImage: `url(${spot.venue_image_url || mockVenueImages[idx % mockVenueImages.length]})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    <p className="text-white text-sm font-medium text-center truncate">
                      {spot.venue_name}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white/5 rounded-2xl border border-white/8">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/8">
                  <MapPin className="h-8 w-8 text-[#a855f7]/60" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Your night out history starts here
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  Go live at spots and they'll show up on your profile.
                </p>
              </div>
            )
          ) : spotsView === 'wishlist' ? (
            wishlistPlaces.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {wishlistPlaces.map((place, idx) => (
                  <div key={place.id} className="space-y-2">
                    <div 
                      className="aspect-square rounded-xl overflow-hidden bg-[#1a0a2e] border border-white/8"
                      style={{
                        backgroundImage: `url(${place.venue_image_url || mockVenueImages[idx % mockVenueImages.length]})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                    <p className="text-white text-sm font-medium text-center truncate">
                      {place.venue_name}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white/5 rounded-2xl border border-white/8">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/8">
                  <Bookmark className="h-8 w-8 text-[#a855f7]/60" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Build your wishlist
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  Save spots you want to check out. They'll live here.
                </p>
              </div>
            )
          ) : (
            userPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {userPosts.map((post) => (
                  <div key={post.id} className="space-y-2">
                    <div
                      className="aspect-square rounded-xl overflow-hidden bg-[#1a0a2e] border border-white/8 relative"
                      style={{
                        backgroundImage: post.image_url && post.media_type !== 'video' ? `url(${post.image_url})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      {post.image_url && post.media_type === 'video' ? (
                        <video
                          src={post.image_url}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : !post.image_url ? (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-white/60 text-xs text-center line-clamp-3">
                            {post.text}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-center gap-3 text-white/40 text-xs">
                      <span className="flex items-center gap-0.5"><Heart className="h-3.5 w-3.5 text-red-400" /> {post.likes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="h-3.5 w-3.5 text-white/40" /> {post.comments_count || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white/5 rounded-2xl border border-white/8">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/8">
                  <Camera className="h-8 w-8 text-[#a855f7]/60" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  No posts yet
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  Share moments from your nights out and they'll appear here.
                </p>
              </div>
            )
          )}
        </div>

        {/* Invite Friends Section */}
        <InviteFriendsSection />

        {/* Logout Button at Bottom */}
        <Button
          onClick={() => signOut()}
          variant="outline"
          className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Log Out
        </Button>
      </div>

      {/* QR Code Modal */}
      {inviteCode && (
        <QRCodeModal
          open={showQRModal}
          onOpenChange={setShowQRModal}
          inviteUrl={getInviteUrl()}
        />
      )}

      {/* Quick Status Sheet */}
      <QuickStatusSheet
        open={showQuickStatus}
        onOpenChange={(open) => {
          setShowQuickStatus(open);
          if (!open) fetchProfileData();
        }}
      />

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
    </PullToRefresh>
  );
}
