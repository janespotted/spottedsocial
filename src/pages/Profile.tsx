import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MapPin, Users, Share2, Settings, LogOut, Bookmark, Bell, ChevronRight, Home, Target, UserPlus, QrCode } from 'lucide-react';
import { InviteFriendsSection } from '@/components/InviteFriendsSection';
import { QRCodeModal } from '@/components/QRCodeModal';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CityBadge } from '@/components/CityBadge';
import { ProfileSkeleton } from '@/components/ProfileSkeleton';


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

export default function Profile() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { unreadCount } = useNotifications();
  
  useAutoVenueTracking(); // Trigger auto-venue tracking on profile view
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [friendsCount, setFriendsCount] = useState(0);
  const [placesCount, setPlacesCount] = useState(0);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [locationSharingLevel, setLocationSharingLevel] = useState('all_friends');
  const [wishlistPlaces, setWishlistPlaces] = useState<WishlistPlace[]>([]);
  const [recentSpots, setRecentSpots] = useState<RecentSpot[]>([]);
  const [spotsView, setSpotsView] = useState<'recent' | 'wishlist'>('recent');
  const [currentStatus, setCurrentStatus] = useState<'out' | 'planning' | 'home' | null>(null);
  const [currentVenue, setCurrentVenue] = useState<string | null>(null);
  const [planningNeighborhood, setPlanningNeighborhood] = useState<string | null>(null);
  const [venueNeighborhood, setVenueNeighborhood] = useState<string | null>(null);
  const [isPrivateParty, setIsPrivateParty] = useState(false);
  const [partyNeighborhood, setPartyNeighborhood] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  
  // Triple-tap secret access to demo settings
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleHeaderTripleTap = () => {
    tapCountRef.current += 1;

    // Clear existing timer
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    // If triple-tapped, navigate to demo settings
    if (tapCountRef.current === 3) {
      navigate('/demo-settings');
      tapCountRef.current = 0;
      return;
    }

    // Reset counter after 500ms
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 500);
  };

  useEffect(() => {
    if (user) {
      fetchProfileData();
      fetchInviteCode();
    }
  }, [user]);

  const fetchInviteCode = async () => {
    const { data } = await supabase
      .from('invite_codes')
      .select('code')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setInviteCode(data.code);
    }
  };

  const getInviteUrl = () => `${window.location.origin}/invite/${inviteCode}`;

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

  // Refetch on window focus (navigation back to page)
  useEffect(() => {
    const handleFocus = () => {
      if (user?.id) {
        fetchProfileData();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user?.id]);

  const fetchProfileData = async () => {
    setLoading(true);
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setLocationSharingLevel(profileData.location_sharing_level || 'all_friends');
    }

    // Check user's current night status (out, planning, or home)
    const { data: nightStatus } = await supabase
      .from('night_statuses')
      .select('status, venue_name, venue_id, planning_neighborhood, is_private_party, party_neighborhood')
      .eq('user_id', user?.id)
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
      
      // Fetch venue neighborhood if user is out
      if (nightStatus.status === 'out' && nightStatus.venue_id) {
        const { data: venue } = await supabase
          .from('venues')
          .select('neighborhood')
          .eq('id', nightStatus.venue_id)
          .maybeSingle();
        setVenueNeighborhood(venue?.neighborhood || null);
      } else {
        setVenueNeighborhood(null);
      }
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
      setVenueNeighborhood(null);
      setIsPrivateParty(false);
      setPartyNeighborhood(null);
      setIsLocationSharing(false);
    }

    // Get friends count (both directions)
    const { data: sentFriendships } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    const { data: receivedFriendships } = await supabase
      .from('friendships')
      .select('id')
      .eq('friend_id', user?.id)
      .eq('status', 'accepted');

    setFriendsCount((sentFriendships?.length || 0) + (receivedFriendships?.length || 0));

    // Get places count (unique venues from check-ins)
    const { data: checkins } = await supabase
      .from('checkins')
      .select('venue_name')
      .eq('user_id', user?.id);

    const uniqueVenues = new Set(checkins?.map(c => c.venue_name));
    setPlacesCount(uniqueVenues.size);

    // Get wishlist places
    const { data: wishlist } = await supabase
      .from('wishlist_places')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    setWishlistPlaces(wishlist || []);

    // Get recent spots (unique venues from check-ins, most recent first)
    const { data: recentCheckins } = await supabase
      .from('checkins')
      .select('venue_id, venue_name, created_at')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    // Get unique venues (keep first occurrence = most recent)
    const seenVenues = new Set<string>();
    const uniqueRecentSpots: RecentSpot[] = [];

    for (const checkin of recentCheckins || []) {
      if (checkin.venue_id && !seenVenues.has(checkin.venue_id)) {
        seenVenues.add(checkin.venue_id);
        
        // Fetch venue image
        const { data: venue } = await supabase
          .from('venues')
          .select('google_photo_refs')
          .eq('id', checkin.venue_id)
          .maybeSingle();
        
        const photoRefs = venue?.google_photo_refs as string[] | null;
        const imageUrl = photoRefs?.[0] || null;
        
        uniqueRecentSpots.push({
          venue_id: checkin.venue_id,
          venue_name: checkin.venue_name,
          venue_image_url: imageUrl,
          visited_at: checkin.created_at || ''
        });
        
        if (uniqueRecentSpots.length >= 6) break; // Limit to 6 recent spots
      }
    }

    setRecentSpots(uniqueRecentSpots);
    setLoading(false);
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Spotted Profile',
          text: `Check out @${profile?.username} on Spotted!`,
          url: window.location.href,
        });
      } catch (error) {
        // User cancelled share
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
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
          <div className="flex gap-3">
            <button 
              onClick={() => navigate('/settings')}
              className="w-10 h-10 rounded-full bg-[#2d1b4e] border border-[#a855f7]/40 flex items-center justify-center text-white hover:bg-[#a855f7]/20 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate('/friend-requests')}
              className="w-10 h-10 rounded-full bg-[#2d1b4e] border border-[#a855f7]/40 flex items-center justify-center text-white hover:bg-[#a855f7]/20 transition-colors"
              aria-label="Friend Requests"
            >
              <UserPlus className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate('/messages', { state: { activeTab: 'activity' } })}
              className="relative w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all"
              aria-label="View activity"
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
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* User Identity */}
        <div>
          <h2 className="text-xl font-bold text-white">@{profile?.username || 'username'}</h2>
          <button 
            onClick={openCheckIn}
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
                    Out · Private Party{partyNeighborhood ? ` (${partyNeighborhood})` : ''}
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
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Friends
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
                <SelectTrigger className="w-auto min-w-[130px] border-[#a855f7]/30 bg-white/5 backdrop-blur-sm text-white rounded-full h-8 text-sm px-3">
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
              <Select value={spotsView} onValueChange={(v) => setSpotsView(v as 'recent' | 'wishlist')}>
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
                  No recent spots yet
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  Check in at venues and they'll appear here
                </p>
              </div>
            )
          ) : (
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
                  No saved places yet
                </h3>
                <p className="text-white/50 text-sm max-w-xs">
                  Tap the + on venues you want to visit and they'll appear here
                </p>
              </div>
            )
          )}
        </div>

        {/* Invite Friends Section */}
        <InviteFriendsSection />

        {/* Logout Button at Bottom */}
        <Button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/auth');
          }}
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
    </div>
  );
}
