import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { MapPin, Users, Share2, Settings, LogOut, Bookmark, Bell, ChevronDown, Home, Target, Navigation } from 'lucide-react';
import { InviteFriendsSection } from '@/components/InviteFriendsSection';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CityBadge } from '@/components/CityBadge';
import { ProfileSkeleton } from '@/components/ProfileSkeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CITY_NEIGHBORHOODS } from '@/lib/city-neighborhoods';
import { useUserCity } from '@/hooks/useUserCity';

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
  const { city } = useUserCity();
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
    }
  }, [user]);

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
      .select('status, venue_name, planning_neighborhood')
      .eq('user_id', user?.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (nightStatus) {
      setCurrentStatus(nightStatus.status as 'out' | 'planning' | 'home');
      setCurrentVenue(nightStatus.venue_name);
      setPlanningNeighborhood(nightStatus.planning_neighborhood);
      setIsLocationSharing(nightStatus.status === 'out' && !!nightStatus.venue_name);
    } else {
      setCurrentStatus(null);
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
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

  // Status change handlers
  const handleNotGoingOut = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('night_statuses')
        .update({ 
          status: 'home',
          venue_id: null,
          venue_name: null,
          planning_neighborhood: null,
          lat: null,
          lng: null,
          expires_at: null
        })
        .eq('user_id', user.id);
      
      setCurrentStatus('home');
      setCurrentVenue(null);
      setPlanningNeighborhood(null);
      toast.success('Status updated to staying in');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleChangeNeighborhood = async (neighborhood: string) => {
    if (!user) return;
    
    try {
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'planning',
          planning_neighborhood: neighborhood,
          venue_id: null,
          venue_name: null,
          expires_at: new Date(new Date().setHours(29, 0, 0, 0)).toISOString() // 5am next day
        });
      
      setPlanningNeighborhood(neighborhood);
      setCurrentStatus('planning');
      toast.success(`Planning in ${neighborhood}`);
    } catch (error) {
      console.error('Error updating neighborhood:', error);
      toast.error('Failed to update neighborhood');
    }
  };

  const handleStartPlanning = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'planning',
          planning_neighborhood: null,
          venue_id: null,
          venue_name: null,
          expires_at: new Date(new Date().setHours(29, 0, 0, 0)).toISOString() // 5am next day
        });
      
      setCurrentStatus('planning');
      setPlanningNeighborhood(null);
      toast.success('Status updated to planning');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
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
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "flex items-center gap-1.5 cursor-pointer hover:bg-white/10 transition-all outline-none px-3 py-1.5 rounded-full border bg-white/5",
              currentStatus === 'out' ? "border-[#d4ff00]/40" : 
              currentStatus === 'planning' ? "border-[#a855f7]/40" : 
              "border-white/10"
            )}>
              {currentStatus === 'out' && currentVenue ? (
                <>
                  <span className="text-[#d4ff00] font-medium">@ {currentVenue}</span>
                  <MapPin className="h-4 w-4 text-[#d4ff00] fill-[#d4ff00]" />
                </>
              ) : currentStatus === 'planning' ? (
                <span className="text-[#a855f7] font-medium">
                  🎯 Planning{planningNeighborhood ? ` (${planningNeighborhood})` : ''}
                </span>
              ) : (
                <span className="text-white/40">Not Sharing Location</span>
              )}
              <ChevronDown className="h-4 w-4 text-white/60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-black/60 backdrop-blur-xl border-white/10 min-w-[220px] rounded-xl p-1.5 z-50">
              {/* Options based on current status */}
              {currentStatus === 'out' && (
                <>
                  <DropdownMenuItem 
                    onClick={openCheckIn}
                    className="text-white hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <Navigation className="h-4 w-4 text-[#a855f7]" />
                    <span className="font-medium">Change venue</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10 my-1" />
                  <DropdownMenuItem 
                    onClick={handleNotGoingOut}
                    className="text-white/70 hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <Home className="h-4 w-4 text-white/40" />
                    Not going out anymore
                  </DropdownMenuItem>
                </>
              )}
              {currentStatus === 'planning' && (
                <>
                  <DropdownMenuItem 
                    onClick={openCheckIn}
                    className="text-white hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <MapPin className="h-4 w-4 text-[#d4ff00]" />
                    <span className="font-medium">Going out</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10 my-1" />
                  <DropdownMenuItem 
                    onClick={handleNotGoingOut}
                    className="text-white/70 hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <Home className="h-4 w-4 text-white/40" />
                    Not going out anymore
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-white hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5">
                      <Target className="h-4 w-4 text-[#a855f7]" />
                      <span className="font-medium">Change neighborhood</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-black/60 backdrop-blur-xl border-white/10 rounded-xl p-1.5 max-h-[300px] overflow-y-auto z-50">
                      {(CITY_NEIGHBORHOODS[city] || CITY_NEIGHBORHOODS.la).map((neighborhood) => (
                        <DropdownMenuItem
                          key={neighborhood}
                          onClick={() => handleChangeNeighborhood(neighborhood)}
                          className={`text-white hover:bg-white/10 cursor-pointer rounded-lg py-2 px-3 ${planningNeighborhood === neighborhood ? 'bg-white/10' : ''}`}
                        >
                          {neighborhood}
                          {planningNeighborhood === neighborhood && <span className="ml-auto text-[#a855f7]">✓</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              {(!currentStatus || currentStatus === 'home') && (
                <>
                  <DropdownMenuItem 
                    onClick={openCheckIn}
                    className="text-white hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <MapPin className="h-4 w-4 text-[#d4ff00]" />
                    <span className="font-medium">I'm going out</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10 my-1" />
                  <DropdownMenuItem 
                    onClick={handleStartPlanning}
                    className="text-white hover:bg-white/10 cursor-pointer rounded-lg py-2.5 px-3 gap-2.5"
                  >
                    <Target className="h-4 w-4 text-[#a855f7]" />
                    <span className="font-medium">I'm planning</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Avatar + Stats */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-[#1a0f2e] text-white text-2xl">
              {profile?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>

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
        <div className={`bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4 transition-opacity duration-300 ${currentStatus === 'planning' ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#d4ff00] flex items-center justify-center">
                <MapPin className="h-6 w-6 text-[#1a0f2e] fill-[#1a0f2e]" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Location Sharing</h3>
                <p className="text-white/60 text-sm">Who can see your location</p>
              </div>
            </div>

            <Select value={locationSharingLevel} onValueChange={handleLocationSharingChange}>
              <SelectTrigger className="w-[160px] border-[#d4ff00] bg-[#d4ff00]/10 text-white rounded-full">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-[#1a0f2e] border-[#a855f7]/20 text-white">
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
    </div>
  );
}
