import { useEffect, useState } from 'react';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bookmark, BookmarkCheck, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, ChevronDown, UserPlus, X as CloseIcon, Share2, MoreVertical, Flag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { BuzzItem } from './BuzzItem';
import { DropVibeDialog } from './DropVibeDialog';
import { ReportDialog } from './ReportDialog';
import { VenueHoursDisplay, getHoursDisplayString } from '@/lib/venue-hours';
import type { VenueHours } from '@/lib/venue-hours';

interface VenueData {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  type: string;
  lat: number;
  lng: number;
}

interface FriendAtVenue {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface BuzzItemData {
  type: 'text' | 'media';
  id: string;
  text?: string;
  emoji_vibe?: string | null;
  media_url?: string;
  media_type?: string;
  is_anonymous: boolean;
  created_at: string;
  profile?: {
    display_name: string;
    avatar_url: string | null;
  };
}

const getVenueTypeDisplay = (type: string) => {
  const typeMap: Record<string, { label: string; emoji: string; color: string }> = {
    'bar': { label: 'Bar', emoji: '🍺', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    'cocktail_bar': { label: 'Cocktail Lounge', emoji: '🍸', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    'nightclub': { label: 'Club', emoji: '🎉', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
    'rooftop': { label: 'Rooftop', emoji: '🌃', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
    'speakeasy': { label: 'Speakeasy', emoji: '🕵️', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    'lounge': { label: 'Lounge', emoji: '🛋️', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    'dive_bar': { label: 'Dive Bar', emoji: '🍻', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  };
  return typeMap[type] || { label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), emoji: '📍', color: 'bg-white/10 text-white/70 border-white/20' };
};

export function VenueIdCard() {
  const { selectedVenueId, closeVenueCard, openVenueCard } = useVenueIdCard();
  const { openFriendCard } = useFriendIdCard();
  const { openInviteModal } = useVenueInvite();
  const { user } = useAuth();
  const demoEnabled = useDemoMode();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendAtVenue[]>([]);
  const [distance, setDistance] = useState<string>('--');
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [buzzItems, setBuzzItems] = useState<BuzzItemData[]>([]);
  const [showDropVibe, setShowDropVibe] = useState(false);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [venueHours, setVenueHours] = useState<VenueHoursDisplay | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [googlePhotos, setGooglePhotos] = useState<string[]>([]);
  const [googleRating, setGoogleRating] = useState<number | null>(null);
  const [googleRatingsCount, setGoogleRatingsCount] = useState<number>(0);
  const [similarVenues, setSimilarVenues] = useState<Array<{
    id: string;
    name: string;
    neighborhood: string;
    google_rating: number | null;
  }>>([]);
  const [isUserAtVenue, setIsUserAtVenue] = useState(false);
  const [totalCheckIns, setTotalCheckIns] = useState(0);
  const [showReportDialog, setShowReportDialog] = useState(false);

  useEffect(() => {
    if (selectedVenueId) {
      fetchVenueData();
      fetchBuzzItems();
      fetchVenueHours();
    }
  }, [selectedVenueId]);

  useEffect(() => {
    if (venue) {
      fetchSimilarVenues();
    }
  }, [venue?.id]);

  const fetchVenueHours = async () => {
    if (!selectedVenueId) return;

    setLoadingHours(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-venue-hours', {
        body: { venueId: selectedVenueId }
      });

      if (error) {
        console.error('Error fetching venue hours:', error);
        setVenueHours(null);
        return;
      }

      if (data?.operating_hours) {
        const hoursDisplay = getHoursDisplayString(data.operating_hours as VenueHours);
        setVenueHours(hoursDisplay);
      } else {
        setVenueHours(null);
      }

      // Set Google data
      if (data?.google_photo_refs && Array.isArray(data.google_photo_refs)) {
        setGooglePhotos(data.google_photo_refs);
      } else {
        setGooglePhotos([]);
      }

      if (data?.google_rating) {
        setGoogleRating(data.google_rating);
      } else {
        setGoogleRating(null);
      }

      if (data?.google_user_ratings_total) {
        setGoogleRatingsCount(data.google_user_ratings_total);
      } else {
        setGoogleRatingsCount(0);
      }
    } catch (error) {
      console.error('Error fetching venue hours:', error);
      setVenueHours(null);
    } finally {
      setLoadingHours(false);
    }
  };

  const fetchVenueData = async () => {
    if (!selectedVenueId || !user) return;

    try {
      // Fetch venue data
      const { data: venueData } = await supabase
        .from('venues')
        .select('*')
        .eq('id', selectedVenueId)
        .single();

      if (venueData) {
        setVenue(venueData);

        // Check if venue is in wishlist
        const { data: wishlistEntry } = await supabase
          .from('wishlist_places')
          .select('id')
          .eq('user_id', user.id)
          .eq('venue_name', venueData.name)
          .maybeSingle();

        setIsInWishlist(!!wishlistEntry);

        // Get user's location for distance calculation
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('last_known_lat, last_known_lng')
          .eq('id', user.id)
          .single();

        if (myProfile?.last_known_lat && myProfile?.last_known_lng) {
          const dist = calculateDistance(
            myProfile.last_known_lat,
            myProfile.last_known_lng,
            venueData.lat,
            venueData.lng
          );
          setDistance(dist);
        }

        // Fetch ALL users at this venue (for total check-ins count)
        const { data: statuses } = await supabase
          .from('night_statuses')
          .select('user_id')
          .eq('venue_name', venueData.name)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString());

        // Set total check-ins count
        setTotalCheckIns(statuses?.length || 0);

        if (statuses && statuses.length > 0) {
          const userIds = statuses.map(s => s.user_id);
          
          // Get friend profiles (both directions)
          const { data: sentFriendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

          const { data: receivedFriendships } = await supabase
            .from('friendships')
            .select('user_id')
            .eq('friend_id', user.id)
            .eq('status', 'accepted');

          const friendIds = [
            ...(sentFriendships?.map(f => f.friend_id) || []),
            ...(receivedFriendships?.map(f => f.user_id) || [])
          ];
          const friendsAtVenueIds = userIds.filter(id => friendIds.includes(id));

          if (friendsAtVenueIds.length > 0) {
            // Use safe RPC to get profiles (respects location privacy)
            const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
            
            // Filter to only friends at venue and conditionally exclude demo users
            let profiles = (allProfiles || []).filter((p: any) => friendsAtVenueIds.includes(p.id));
            
            // Only filter out demo users when demo mode is OFF (bootstrap mode)
            if (!demoEnabled) {
              profiles = profiles.filter((p: any) => p.is_demo === false);
            }

            // Deduplicate by display_name (keeps first occurrence)
            const seenNames = new Set<string>();
            const uniqueFriends = (profiles || []).filter(friend => {
              if (seenNames.has(friend.display_name)) {
                return false;
              }
              seenNames.add(friend.display_name);
              return true;
            });

            setFriendsAtVenue(uniqueFriends);
          } else {
            setFriendsAtVenue([]);
          }
        } else {
          setFriendsAtVenue([]);
        }

        // Check if current user is at this venue
        const { data: userStatus } = await supabase
          .from('night_statuses')
          .select('venue_id')
          .eq('user_id', user.id)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        setIsUserAtVenue(userStatus?.venue_id === selectedVenueId);
      }
    } catch (error) {
      console.error('Error fetching venue data:', error);
    }
  };

  const fetchBuzzItems = async () => {
    if (!selectedVenueId || !user) return;

    try {
      const now = new Date().toISOString();

      // Fetch text vibes
      const { data: textVibes } = await supabase
        .from('venue_buzz_messages')
        .select('*')
        .eq('venue_id', selectedVenueId)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

      // Fetch media clips (stories with is_public_buzz = true)
      const { data: mediaClips } = await supabase
        .from('stories')
        .select('*')
        .eq('venue_id', selectedVenueId)
        .eq('is_public_buzz', true)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

      // Get user profiles for non-anonymous items
      const textUserIds = (textVibes || [])
        .filter(v => !v.is_anonymous)
        .map(v => v.user_id);
      const mediaUserIds = (mediaClips || [])
        .filter(c => !c.is_anonymous)
        .map(c => c.user_id);
      const allUserIds = [...new Set([...textUserIds, ...mediaUserIds])];

      let profilesMap: Record<string, { display_name: string; avatar_url: string | null }> = {};

      if (allUserIds.length > 0) {
        // Use safe RPC to get profiles (respects location privacy)
        const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
        const profiles = (allProfiles || []).filter((p: any) => allUserIds.includes(p.id));

        if (profiles) {
          profilesMap = profiles.reduce((acc: typeof profilesMap, p: any) => {
            acc[p.id] = { display_name: p.display_name, avatar_url: p.avatar_url };
            return acc;
          }, {} as typeof profilesMap);
        }
      }

      // Transform and combine items
      const textItems: BuzzItemData[] = (textVibes || []).map(v => ({
        type: 'text' as const,
        id: v.id,
        text: v.text,
        emoji_vibe: v.emoji_vibe,
        is_anonymous: v.is_anonymous || false,
        created_at: v.created_at || '',
        profile: profilesMap[v.user_id],
      }));

      const mediaItems: BuzzItemData[] = (mediaClips || []).map(c => ({
        type: 'media' as const,
        id: c.id,
        media_url: c.media_url,
        media_type: c.media_type,
        is_anonymous: c.is_anonymous || false,
        created_at: c.created_at,
        profile: profilesMap[c.user_id],
      }));

      // Combine and sort by created_at (most recent first)
      const allItems = [...textItems, ...mediaItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setBuzzItems(allItems);
    } catch (error) {
      console.error('Error fetching buzz items:', error);
    }
  };

  const fetchSimilarVenues = async () => {
    if (!selectedVenueId || !venue) return;

    try {
      // First try to find venues in the same neighborhood and city
      let { data: similar } = await supabase
        .from('venues')
        .select('id, name, neighborhood, google_rating')
        .eq('neighborhood', venue.neighborhood)
        .eq('city', venue.city)
        .neq('id', selectedVenueId)
        .order('popularity_rank', { ascending: true })
        .limit(4);

      // If not enough venues in the same neighborhood, fall back to same city
      if (!similar || similar.length < 3) {
        const { data: cityVenues } = await supabase
          .from('venues')
          .select('id, name, neighborhood, google_rating')
          .eq('city', venue.city)
          .neq('id', selectedVenueId)
          .order('popularity_rank', { ascending: true })
          .limit(4);

        similar = cityVenues || [];
      }

      setSimilarVenues(similar || []);
    } catch (error) {
      console.error('Error fetching similar venues:', error);
      setSimilarVenues([]);
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance.toFixed(1);
  };

  const handleMapPinClick = () => {
    if (venue) {
      // Open Apple Maps with directions from current location to venue
      const appleMapsUrl = `https://maps.apple.com/?daddr=${venue.lat},${venue.lng}&dirflg=d`;
      window.open(appleMapsUrl, '_blank');
    }
  };

  const handleWishlistToggle = async () => {
    if (!venue || !user) return;

    if (isInWishlist) {
      // Remove from wishlist
      await supabase
        .from('wishlist_places')
        .delete()
        .eq('user_id', user.id)
        .eq('venue_name', venue.name);

      setIsInWishlist(false);
      haptic.light();
      toast.success('Removed from wishlist');
    } else {
      // Add to wishlist
      await supabase
        .from('wishlist_places')
        .insert({
          user_id: user.id,
          venue_name: venue.name,
          venue_image_url: null
        });

      setIsInWishlist(true);
      haptic.success();
      toast.success('Added to wishlist! 🎉');
    }
  };

  const handleShareVenue = async () => {
    if (!venue) return;
    
    const shareText = `Check out ${venue.name} in ${venue.neighborhood}! 🎉`;
    const shareUrl = `${window.location.origin}/?venue=${selectedVenueId}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: venue.name,
          text: shareText,
          url: shareUrl,
        });
        haptic.success();
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        haptic.light();
        toast.success('Link copied!');
      } catch {
        toast.error("Couldn't copy link");
      }
    }
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeDown: closeVenueCard,
    threshold: 50
  });

  const calculateEnergyLevel = (checkIns: number): number => {
    if (checkIns >= 16) return 3;
    if (checkIns >= 6) return 2;
    if (checkIns > 0) return 1;
    return 0;
  };

  const renderEnergyBars = (level: number) => {
    const barHeights = ['h-2', 'h-3', 'h-4'];
    
    return (
      <div className="flex gap-0.5 items-end">
        {[1, 2, 3].map((bar, index) => (
          <div
            key={bar}
            className={`w-1.5 rounded-sm transition-all ${barHeights[index]} ${
              bar <= level ? 'bg-white' : 'bg-white/20'
            }`}
          />
        ))}
      </div>
    );
  };

  if (!selectedVenueId || !venue) return null;

  const visibleFriends = friendsAtVenue.slice(0, 4);
  const remainingCount = friendsAtVenue.length - visibleFriends.length;

  return (
    <>
      {selectedVenueId && venue && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[300] bg-black/80 animate-in fade-in-0"
            onClick={closeVenueCard}
          />
      {/* Mobile frame constrained container */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-full z-[300] flex items-center justify-center px-4 pointer-events-none">
              {/* Card */}
              <div 
                className="relative w-full max-w-[390px] max-h-[85vh] flex flex-col bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/95 to-[#0a0118]/95 backdrop-blur-xl border-2 border-[#a855f7] rounded-3xl p-0 overflow-hidden pointer-events-auto animate-card-lift"
                {...swipeHandlers}
              >
                {/* Close button */}
                <button 
                  onClick={closeVenueCard}
                  className="absolute right-4 top-4 z-20 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <CloseIcon className="h-4 w-4 text-white" />
                  <span className="sr-only">Close</span>
                </button>

                {/* Three-dot menu positioned below the X close button */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="absolute right-4 top-14 z-20 p-1 rounded-full hover:bg-white/10 transition-colors">
                    <MoreVertical className="h-5 w-5 text-white/60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#1a0f2e] border-[#a855f7]/40">
                    <DropdownMenuItem 
                      onClick={() => setShowReportDialog(true)}
                      className="text-white hover:bg-[#a855f7]/20 cursor-pointer"
                    >
                      <Flag className="h-4 w-4 mr-2" />
                      Report Venue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="p-5">
              {/* Photo Carousel */}
              {googlePhotos.length > 0 ? (
                <div className="relative mb-4 -mx-5 -mt-5">
                  <Carousel className="w-full">
                    <CarouselContent>
                      {googlePhotos.map((photoUrl, index) => (
                        <CarouselItem key={index}>
                          <div className="relative w-full h-56 overflow-hidden">
                            <img
                              src={photoUrl}
                              alt={`${venue.name} photo ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {/* Dark gradient overlay at bottom */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {googlePhotos.length > 1 && (
                      <>
                        <CarouselPrevious className="left-2 bg-white/90 hover:bg-white border-none" />
                        <CarouselNext className="right-2 bg-white/90 hover:bg-white border-none" />
                      </>
                    )}
                  </Carousel>
                </div>
              ) : (
                /* Fallback gradient if no photos */
                <div className="relative mb-4 -mx-5 -mt-5">
                  <div className="w-full h-56 bg-gradient-to-br from-[#a855f7]/40 to-[#d4ff00]/40" />
                </div>
              )}

              {/* Venue Info */}
              <div className="mb-4">
                <div className="flex items-start justify-between mb-1">
                  <h2 className="text-2xl font-bold text-white flex-1">
                    {venue.name}
                  </h2>
                </div>

                {/* Venue Type Badge */}
                {venue.type && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border mb-2 ${getVenueTypeDisplay(venue.type).color}`}>
                    {getVenueTypeDisplay(venue.type).emoji} {getVenueTypeDisplay(venue.type).label}
                  </span>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm text-white/60 italic">
                    {venue.neighborhood} • {distance} mi
                  </p>
                  {/* Operating Hours Badge */}
                  {venueHours && !loadingHours && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      venueHours.isOpen 
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {venueHours.isOpen ? '○ Open' : '● Closed'}
                    </span>
                  )}
                  {/* Energy Level Bars - Based on total check-ins, only show when venue is open */}
                  {venueHours?.isOpen && (
                    <div className="flex-shrink-0">
                      {renderEnergyBars(calculateEnergyLevel(totalCheckIns))}
                    </div>
                  )}
                </div>
              </div>

              {/* Friends at Venue - Clean layout */}
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {friendsAtVenue.length > 0 ? (
                      <>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex -space-x-2 cursor-pointer hover:opacity-90 transition-opacity">
                              {visibleFriends.map((friend) => (
                                <Avatar key={friend.id} className="w-10 h-10 border-2 border-[#0a0118]">
                                  <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
                                  <AvatarFallback className="bg-[#a855f7] text-white">
                                    {friend.display_name[0]}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {remainingCount > 0 && (
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#a855f7]/30 border-2 border-[#0a0118] text-xs text-white">
                                  +{remainingCount}
                                </div>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl z-[400]" align="start">
                            <p className="text-white/60 text-xs px-2 mb-2">
                              Friends at {venue.name}
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {friendsAtVenue.map((friend) => (
                                <button
                                  key={friend.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFriendCard({
                                      userId: friend.id,
                                      displayName: friend.display_name,
                                      avatarUrl: friend.avatar_url,
                                      venueName: venue.name,
                                      lat: venue.lat,
                                      lng: venue.lng,
                                    });
                                  }}
                                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[#a855f7]/20 transition-colors"
                                >
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} />
                                    <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                                      {friend.display_name[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-white text-sm flex-1 text-left">{friend.display_name}</span>
                                  <ChevronRight className="h-4 w-4 text-white/40" />
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <span className="text-sm text-white/60">
                          {friendsAtVenue.length} friend{friendsAtVenue.length !== 1 ? 's' : ''} here
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-white/60">Be the first to bring your crew 🎉</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Primary CTA - Invite Friends */}
              <Button
                onClick={() => openInviteModal(venue.id, venue.name)}
                className="w-full mb-3 bg-gradient-to-r from-[#c4ee00] to-[#d4ff00] text-black font-semibold shadow-[0_2px_8px_rgba(212,255,0,0.25)] hover:shadow-[0_4px_16px_rgba(212,255,0,0.4)] transition-all duration-300"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Friends Here
              </Button>

              {/* Secondary CTAs - Full Width Row */}
              <div className="flex gap-3 mb-4">
                <Button
                  onClick={handleMapPinClick}
                  variant="outline"
                  className="flex-1 bg-[#a855f7]/10 hover:bg-[#a855f7]/20 text-white border border-[#a855f7]/40 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-300"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Directions
                </Button>
                <Button
                  onClick={handleShareVenue}
                  variant="outline"
                  className="flex-1 bg-[#a855f7]/10 hover:bg-[#a855f7]/20 text-white border border-[#a855f7]/40 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-300"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>

              {/* More Info - Single collapsible, closed by default */}
              <Collapsible open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
                <div className="border-t border-white/10 pt-3">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between py-2 text-white/60 hover:text-white/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-sm">More Info</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWishlistToggle();
                          }}
                          className="flex items-center gap-1 text-xs text-white/50 hover:text-[#d4ff00] transition-colors"
                          aria-label={isInWishlist ? "Remove from wishlist" : "Add to wishlist"}
                        >
                          {isInWishlist ? (
                            <BookmarkCheck className="w-4 h-4 text-[#d4ff00]" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <ChevronDown 
                        className={`w-4 h-4 transition-transform ${
                          moreInfoOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="pt-3">
                  {/* Tonight's Buzz sub-section */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white">Tonight's Buzz ({buzzItems.length})</h4>
                      {isUserAtVenue && (
                        <Button
                          onClick={() => setShowDropVibe(true)}
                          size="sm"
                          className="bg-[#d4ff00] text-[#2d1b4e] hover:bg-[#d4ff00]/90 font-semibold text-xs h-7"
                        >
                          Drop a Vibe ✨
                        </Button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {buzzItems.length > 0 ? (
                        buzzItems.map((item) => (
                          <BuzzItem key={item.id} item={item as any} />
                        ))
                      ) : (
                        <p className="text-center text-white/50 py-3 text-sm">No vibes yet. Drop yours! ✨</p>
                      )}
                    </div>
                  </div>

                  {/* Trending Nearby sub-section */}
                  {similarVenues.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-white mb-2">Trending Nearby</h4>
                      <div className="space-y-2">
                        {similarVenues.map((similarVenue) => (
                          <button
                            key={similarVenue.id}
                            onClick={() => {
                              closeVenueCard();
                              setTimeout(() => openVenueCard(similarVenue.id), 100);
                            }}
                            className="w-full p-3 bg-[#2d1b4e]/30 rounded-lg border border-[#a855f7]/10 hover:bg-[#2d1b4e]/50 hover:border-[#a855f7]/30 transition-all text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-white font-medium text-sm">{similarVenue.name}</p>
                                <p className="text-xs text-white/50">{similarVenue.neighborhood}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Google rating sub-section */}
                  {googleRating && (
                    <div className="text-center text-xs text-white/40 pb-2">
                      {googleRating.toFixed(1)} ⭐ on Google ({googleRatingsCount.toLocaleString()})
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <DropVibeDialog
        open={showDropVibe}
        onOpenChange={setShowDropVibe}
        venueId={venue?.id || ''}
        venueName={venue?.name || ''}
        onVibeSubmitted={fetchBuzzItems}
      />

      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType="venue"
        targetId={venue?.id || ''}
        targetName={venue?.name}
      />
    </>
  );
}
