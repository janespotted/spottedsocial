import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { APP_BASE_URL, getShareableUrl, copyToClipboard } from '@/lib/platform';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MapPin, Users, Share2, Settings, LogOut, Bookmark, Bell, ChevronRight, Home, Target, UserPlus, QrCode, Camera, Search, Heart, MessageCircle } from 'lucide-react';
import { FriendSearchModal } from '@/components/FriendSearchModal';
import { NotificationBadge } from '@/components/NotificationBadge';
import { InviteFriendsSection } from '@/components/InviteFriendsSection';
import { QRCodeModal } from '@/components/QRCodeModal';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CityBadge } from '@/components/CityBadge';
import { ProfileSkeleton } from '@/components/ProfileSkeleton';
import { QuickStatusSheet } from '@/components/QuickStatusSheet';


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
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);
  const [placesCount, setPlacesCount] = useState(0);
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
  const [isPrivateParty, setIsPrivateParty] = useState(false);
  const [partyNeighborhood, setPartyNeighborhood] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showQuickStatus, setShowQuickStatus] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  
  // Triple-tap secret access to demo settings (admin-only)
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Pre-fetch admin status on mount
  useEffect(() => {
    if (!user) return;
    supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' as any })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user]);

  const handleHeaderTripleTap = () => {
    if (!isAdmin) return; // Non-admins: triple-tap does nothing

    tapCountRef.current += 1;

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    if (tapCountRef.current === 3) {
      navigate('/demo-settings');
      tapCountRef.current = 0;
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 500);
  };

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
      .select('status, venue_name, venue_id, planning_neighborhood, is_private_party, party_neighborhood')
      .eq('user_id', user.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (nightStatus) {
      setCurrentStatus(nightStatus.status as 'out' | 'planning' | 'home');
      setCurrentVenue(nightStatus.venue_name);
      setPlanningNeighborhood(nightStatus.planning_neighborhood);
      setIsPrivateParty(nightStatus.is_private_party || false);
      setPartyNeighborhood(nightStatus.party_neighborhood);
      setIsLocationSharing(nightStatus.status === 'out' && (!!nightStatus.venue_name || nightStatus.is_private_party));
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
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
        .select('id, display_name, username, avatar_url, bio, home_city, created_at, has_onboarded, is_demo, location_sharing_level, push_enabled')
        .eq('id', user?.id)
        .single(),
      supabase
        .from('night_statuses')
        .select('status, venue_name, venue_id, planning_neighborhood, is_private_party, party_neighborhood')
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
        .select('venue_name')
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

    // Process friends count
    setFriendsCount((sentFriendshipsResult.data?.length || 0) + (receivedFriendshipsResult.data?.length || 0));

    // Process places count
    const uniqueVenues = new Set(checkinsCountResult.data?.map(c => c.venue_name));
    setPlacesCount(uniqueVenues.size);

    // Process wishlist
    setWishlistPlaces(wishlistResult.data || []);

    // Process night status
    const nightStatus = nightStatusResult.data;
    if (nightStatus) {
      setCurrentStatus(nightStatus.status as 'out' | 'planning' | 'home');
      setCurrentVenue(nightStatus.venue_name);
      setPlanningNeighborhood(nightStatus.planning_neighborhood);
      setIsPrivateParty(nightStatus.is_private_party || false);
      setPartyNeighborhood(nightStatus.party_neighborhood);
      setIsLocationSharing(nightStatus.status === 'out' && (!!nightStatus.venue_name || nightStatus.is_private_party));
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
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
          return [v.id, refs?.[0] || null] as [string, string | null];
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
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between px-4 py-6">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleHeaderTripleTap}
              className="text-2xl font-light tracking-[0.3em] text-white select-none"
            >
              Spotted
            </button>
            <CityBadge />
          </div>
          <div className="flex gap-4">
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
              <img src={spottedLogo} alt="Go live" className="h-12 w-12 object-contain" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* User Identity */}
        <div>
          <h2 className="text-xl font-bold text-white">@{profile?.username || 'username'}</h2>
          <button 
            onClick={() => setShowQuickStatus(true)}
            className={cn(
              "flex items-center gap-1.5 cursor-pointer hover:bg-white/10 transition-all px-3 py-1.5 rounded-full border bg-white/5 mt-1",
              currentStatus === 'out' ? "border-[#d4ff00]/40" : 
              currentStatus === 'planning' ? "border-[#a855f7]/40" : 
              "border-white/10"
            )}
          >
            {currentStatus === 'out' ? (
              isPrivateParty ? (
                <>
                  <MapPin className="h-4 w-4 text-[#d4ff00] fill-[#d4ff00]" />
                  <span className="text-[#d4ff00] font-medium">
                    Out · {currentVenue || 'Private Party'}{partyNeighborhood ? ` (${partyNeighborhood})` : ''}
                  </span>
                </>
              ) : currentVenue ? (
                <>
                  <MapPin className="h-4 w-4 text-[#d4ff00] fill-[#d4ff00]" />
                  <span className="text-[#d4ff00] font-medium">Out · {currentVenue}</span>
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 text-[#d4ff00] fill-[#d4ff00]" />
                  <span className="text-[#d4ff00] font-medium">Out</span>
                </>
              )
            ) : currentStatus === 'planning' ? (
              <>
                <Target className="h-4 w-4 text-[#a855f7]" />
                <span className="text-[#a855f7] font-medium">
                  Planning{planningNeighborhood ? ` · ${planningNeighborhood}` : ''}
                </span>
              </>
            ) : (
              <>
                <Home className="h-4 w-4 text-white/40" />
                <span className="text-white/40 font-medium">Staying In</span>
              </>
            )}
          </button>
        </div>

        {/* Avatar + Stats */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/profile')} className="cursor-pointer">
            <Avatar className="h-20 w-20 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#1a0f2e] text-white text-2xl">
                {profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
          </button>

          <div className="flex-1">
            <h3 className="text-2xl font-bold text-white mb-2">
              {profile?.display_name || 'User'}
            </h3>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{friendsCount}</div>
                <div className="text-white/60 text-sm">Friends</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{placesCount}</div>
                <div className="text-white/60 text-sm">Places</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons - Prominent placement */}
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/friends')}
            className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full"
          >
            <Users className="h-4 w-4 mr-2" />
            Friends
          </Button>
          {inviteCode && (
            <Button
              onClick={() => setShowQRModal(true)}
              variant="outline"
              className="border-[#a855f7]/40 text-white hover:bg-[#a855f7]/20 rounded-full"
            >
              <QrCode className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => navigate('/profile/edit')}
            variant="outline"
            className="flex-1 border-white text-white hover:bg-white/10 rounded-full"
          >
            Edit Profile
          </Button>
          <Button
            onClick={() => navigate('/settings')}
            variant="outline"
            className="border-white/40 text-white hover:bg-white/10 rounded-full px-3"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleShareProfile}
            variant="outline"
            className="flex-1 border-white text-white hover:bg-white/10 rounded-full"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share Profile
          </Button>
        </div>

        {/* Location Sharing Card */}
        <div className="bg-[#1D102D]/60 border border-[#a855f7]/20 rounded-2xl p-5">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a855f7] to-[#6b21a8] flex items-center justify-center">
              <MapPin className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-medium text-white text-base">Location Sharing</h3>
          </div>

          {/* Status Section - Inner Card */}
          <div className="bg-white/5 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Status Line with Icon */}
                <div className="flex items-center gap-2 mb-1">
                  {currentStatus === 'out' ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />
                      <p className="text-[#d4ff00] font-medium text-sm">
                        You're out · {isPrivateParty 
                          ? `Private Party${partyNeighborhood ? ` (${partyNeighborhood})` : ''}` 
                          : (currentVenue || 'Unknown venue')}
                      </p>
                    </>
                  ) : currentStatus === 'planning' ? (
                    <>
                      <Target className="h-3.5 w-3.5 text-[#a855f7] shrink-0" />
                      <p className="text-[#a855f7] font-medium text-sm">
                        You're planning{planningNeighborhood ? ` · ${planningNeighborhood}` : ''}
                      </p>
                    </>
                  ) : (
                    <>
                      <Home className="h-3.5 w-3.5 text-white/40 shrink-0" />
                      <p className="text-white/50 font-medium text-sm">
                        You're staying in tonight
                      </p>
                    </>
                  )}
                </div>
                
                {/* Helper Text */}
                <p className="text-white/40 text-xs pl-5">
                  {currentStatus === 'out' 
                    ? 'Your live location is visible' 
                    : 'Your live location is paused'}
                </p>
              </div>
              
              {/* Change Status Button */}
              <button 
                onClick={openCheckIn}
                className="text-[#a855f7]/70 text-xs hover:text-[#a855f7] transition-colors whitespace-nowrap flex items-center gap-0.5 shrink-0"
              >
                Change status
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Privacy Row - ONLY shown when user is "out" */}
          {currentStatus === 'out' && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <p className="text-white/60 text-sm">Who can see your location?</p>
              <Select value={locationSharingLevel} onValueChange={handleLocationSharingChange}>
                <SelectTrigger className="w-auto min-w-[170px] border-[#a855f7]/30 bg-white/5 backdrop-blur-sm text-white rounded-full h-8 text-sm px-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-white/60" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white z-50">
                  <SelectItem value="close_friends" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
                    Close Friends
                  </SelectItem>
                  <SelectItem value="mutual_friends" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
                    Mutual Friends
                  </SelectItem>
                  <SelectItem value="all_friends" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
                    All Friends
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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
                  <SelectItem value="recent" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
                    Recent Spots
                  </SelectItem>
                  <SelectItem value="wishlist" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
                    Wishlist
                  </SelectItem>
                  <SelectItem value="posts" className="text-white hover:bg-[#2d1b4e] focus:bg-[#2d1b4e] focus:text-white">
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
                      className="aspect-square rounded-xl overflow-hidden bg-[#2d1b4e] border border-[#a855f7]/20"
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
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-[#2d1b4e]/30 rounded-2xl border border-[#a855f7]/10">
                <div className="w-16 h-16 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-4 border border-[#a855f7]/20">
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
                      className="aspect-square rounded-xl overflow-hidden bg-[#2d1b4e] border border-[#a855f7]/20"
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
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-[#2d1b4e]/30 rounded-2xl border border-[#a855f7]/10">
                <div className="w-16 h-16 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-4 border border-[#a855f7]/20">
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
                      className="aspect-square rounded-xl overflow-hidden bg-[#2d1b4e] border border-[#a855f7]/20 relative"
                      style={{
                        backgroundImage: post.image_url ? `url(${post.image_url})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
                      {!post.image_url && (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-white/60 text-xs text-center line-clamp-3">
                            {post.text}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-3 text-white/40 text-xs">
                      <span className="flex items-center gap-0.5"><Heart className="h-3.5 w-3.5 text-red-400" /> {post.likes_count || 0}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="h-3.5 w-3.5 text-white/40" /> {post.comments_count || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-[#2d1b4e]/30 rounded-2xl border border-[#a855f7]/10">
                <div className="w-16 h-16 rounded-full bg-[#2d1b4e]/60 flex items-center justify-center mb-4 border border-[#a855f7]/20">
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
  );
}
