import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getShareableUrl, copyToClipboard, openExternalUrl, isNativePlatform } from '@/lib/platform';
import { Capacitor } from '@capacitor/core';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useVenueInvite } from '@/contexts/VenueInviteContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useProfilesSafe } from '@/hooks/useProfilesCache';
import { useFriendIds } from '@/hooks/useFriendIds';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bookmark, BookmarkCheck, ChevronRight, Music, Wine, Beer, Building, EyeOff, Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { ReportDialog } from './ReportDialog';
import { VenueHoursDisplay, getHoursDisplayString } from '@/lib/venue-hours';
import type { VenueHours } from '@/lib/venue-hours';
import { getVenuePhotoUrl } from '@/lib/venue-photo-url';
 import { VenueEventsSection } from './VenueEventsSection';

interface VenueData {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  type: string;
  lat: number;
  lng: number;
  is_map_promoted?: boolean;
}

interface FriendAtVenue {
  id: string;
  display_name: string;
  avatar_url: string | null;
}


const venueTypeIcons: Record<string, React.ReactNode> = {
  'bar': <Beer className="h-3.5 w-3.5" />,
  'cocktail_bar': <Wine className="h-3.5 w-3.5" />,
  'nightclub': <Music className="h-3.5 w-3.5" />,
  'rooftop': <Building className="h-3.5 w-3.5" />,
  'speakeasy': <EyeOff className="h-3.5 w-3.5" />,
  'lounge': <Sofa className="h-3.5 w-3.5" />,
  'dive_bar': <Beer className="h-3.5 w-3.5" />,
};

const getVenueTypeDisplay = (type: string) => {
  const typeMap: Record<string, { label: string; color: string }> = {
    'bar': { label: 'Bar', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    'cocktail_bar': { label: 'Cocktail Lounge', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    'nightclub': { label: 'Club', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
    'rooftop': { label: 'Rooftop', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
    'speakeasy': { label: 'Speakeasy', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    'lounge': { label: 'Lounge', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    'dive_bar': { label: 'Dive Bar', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  };
  const info = typeMap[type] || { label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'bg-white/10 text-white/70 border-white/20' };
  return { ...info, icon: venueTypeIcons[type] || <MapPin className="h-3.5 w-3.5" /> };
};

export function VenueIdCard() {
  const { selectedVenueId, closeVenueCard, openVenueCard } = useVenueIdCard();
  const { openFriendCard } = useFriendIdCard();
  const { openInviteModal } = useVenueInvite();
  const { user } = useAuth();
  const navigate = useNavigate();
  const demoEnabled = useDemoMode();
  const { data: allProfilesData } = useProfilesSafe();
  const { data: cachedFriendIds } = useFriendIds(user?.id);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendAtVenue[]>([]);
  const [friendsPlanning, setFriendsPlanning] = useState<FriendAtVenue[]>([]);
  const [distance, setDistance] = useState<string>('--');
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [hotYap, setHotYap] = useState<{ text: string; score: number } | null>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);
  const [venueHours, setVenueHours] = useState<VenueHoursDisplay | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const [googlePhotos, setGooglePhotos] = useState<string[]>([]);
  const [yapMedia, setYapMedia] = useState<{ url: string; media_type: string }[]>([]);
  
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
      fetchVenueHours();
      fetchYapMedia();
    }
  }, [selectedVenueId]);

  useEffect(() => {
    if (venue) {
      fetchSimilarVenues();
    }
  }, [venue?.id]);

  // Safe extraction helper for API responses
  const extractArraySafe = (response: unknown, key: string): string[] => {
    if (!response || typeof response !== 'object') return [];
    const r = response as Record<string, unknown>;
    const value = r[key];
    if (Array.isArray(value)) return value;
    return [];
  };

  // Fallback function to fetch cached photos from venues table
  const fetchCachedVenuePhotos = async () => {
    if (!selectedVenueId) return;
    
    try {
      const { data: venueData } = await supabase
        .from('venues')
        .select('google_photo_refs, google_rating, google_user_ratings_total, operating_hours')
        .eq('id', selectedVenueId)
        .single();
      
      if (venueData) {
        // Set cached photos if available
        if (venueData.google_photo_refs && Array.isArray(venueData.google_photo_refs)) {
          const refs = venueData.google_photo_refs.filter((p): p is string => typeof p === 'string');
          setGooglePhotos(refs.map((_, i) => getVenuePhotoUrl(selectedVenueId, i)));
        }
        
        if (venueData.google_rating) {
          setGoogleRating(venueData.google_rating);
        }
        
        if (venueData.google_user_ratings_total) {
          setGoogleRatingsCount(venueData.google_user_ratings_total);
        }
        
        if (venueData.operating_hours) {
          const hoursDisplay = getHoursDisplayString(venueData.operating_hours as VenueHours);
          setVenueHours(hoursDisplay);
        }
      }
    } catch (err) {
      console.error('Error fetching cached venue photos:', err);
    }
  };

  const fetchVenueHours = async () => {
    if (!selectedVenueId) return;

    setLoadingHours(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-venue-hours', {
        body: { venueId: selectedVenueId }
      });

      if (error) {
        console.error('Error fetching venue hours:', error);
        // Don't return early - try to load cached data from database
        await fetchCachedVenuePhotos();
        return;
      }

      // Safe extraction of response data
      if (data?.operating_hours) {
        const hoursDisplay = getHoursDisplayString(data.operating_hours as VenueHours);
        setVenueHours(hoursDisplay);
      } else {
        setVenueHours(null);
      }

      // Set Google data — convert refs to proxy URLs
      const photos = extractArraySafe(data, 'google_photo_refs');
      setGooglePhotos(photos.map((_, i) => getVenuePhotoUrl(selectedVenueId!, i)));

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
      // Fallback to cached data
      await fetchCachedVenuePhotos();
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

          // Filter to only the current user's friends (close, direct, mutual)
          const friendIds = cachedFriendIds || [];
          const friendsAtVenueIds = userIds.filter(id => friendIds.includes(id));

          if (friendsAtVenueIds.length > 0) {
            let profiles = (allProfilesData || []).filter((p: any) => friendsAtVenueIds.includes(p.id));

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

        // Fetch friends planning to go to this venue (from plans table)
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        // Get plans for this venue today that haven't expired
        const { data: venuePlans } = await supabase
          .from('plans')
          .select('id, user_id, plan_time')
          .eq('venue_id', selectedVenueId)
          .eq('plan_date', today)
          .gt('expires_at', now);

        if (venuePlans && venuePlans.length > 0) {
          const planIds = venuePlans.map(p => p.id);
          const creatorIds = venuePlans.map(p => p.user_id);

          // Get "I'm Down" users for these plans
          const { data: downs } = await supabase
            .from('plan_downs')
            .select('user_id')
            .in('plan_id', planIds);

          // Get participants for these plans
          const { data: participants } = await supabase
            .from('plan_participants')
            .select('user_id')
            .in('plan_id', planIds);

          // Use cached friend IDs
          const allFriendIds = cachedFriendIds || [];

          // Combine all interested users (deduplicated)
          const allInterestedIds = [...new Set([
            ...creatorIds,
            ...(downs || []).map(d => d.user_id),
            ...(participants || []).map(p => p.user_id),
          ])];

          // Filter to only friends (exclude current user and those already at venue)
          const friendsAtVenueIds = new Set(friendsAtVenue.map(f => f.id));
          const interestedFriendIds = allInterestedIds.filter(id => 
            id !== user.id && allFriendIds.includes(id) && !friendsAtVenueIds.has(id)
          );

          if (interestedFriendIds.length > 0) {
            // Get profiles for planning friends
            const { data: planningProfiles } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .in('id', interestedFriendIds);

            // Filter out demo users when demo mode is OFF
            let filteredPlanningProfiles = planningProfiles || [];
            if (!demoEnabled) {
              const nonDemoIds = new Set((allProfilesData || []).filter((p: any) => p.is_demo === false).map((p: any) => p.id));
              filteredPlanningProfiles = filteredPlanningProfiles.filter(p => nonDemoIds.has(p.id));
            }

            setFriendsPlanning(filteredPlanningProfiles);
          } else {
            setFriendsPlanning([]);
          }
        } else {
          setFriendsPlanning([]);
        }
      }
    } catch (error) {
      console.error('Error fetching venue data:', error);
    }
  };

  const fetchYapMedia = async () => {
    if (!selectedVenueId) return;
    try {
      // First get venue name
      const { data: venueRow } = await supabase
        .from('venues')
        .select('name')
        .eq('id', selectedVenueId)
        .single();
      if (!venueRow) return;

      const { data: yaps } = await supabase
        .from('yap_messages')
        .select('image_url, media_type')
        .eq('venue_name', venueRow.name)
        .not('image_url', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (!yaps || yaps.length === 0) {
        setYapMedia([]);
        return;
      }

      const mediaItems: { url: string; media_type: string }[] = [];
      for (const yap of yaps) {
        if (!yap.image_url) continue;
        const path = yap.image_url;
        const { data: signedData } = await supabase.storage
          .from('yap-media')
          .createSignedUrl(path, 3600);
        if (signedData?.signedUrl) {
          mediaItems.push({ url: signedData.signedUrl, media_type: yap.media_type || 'image' });
        }
      }
      setYapMedia(mediaItems);
    } catch (err) {
      console.error('Error fetching yap media:', err);
      setYapMedia([]);
    }
  };

  const fetchHotYap = async (venueName: string) => {
    try {
      const { data } = await supabase
        .from('yap_messages')
        .select('text, score')
        .eq('venue_name', venueName)
        .eq('is_demo', false)
        .gt('expires_at', new Date().toISOString())
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle();

      setHotYap(data ? { text: data.text, score: data.score } : null);
    } catch (error) {
      console.error('Error fetching hot yap:', error);
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
      if (isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        const mapsUrl = `maps://?daddr=${venue.lat},${venue.lng}`;
        window.open(mapsUrl, '_self');
      } else {
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;
        openExternalUrl(mapsUrl);
      }
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
    const shareUrl = getShareableUrl(`/?venue=${selectedVenueId}`);
    
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
        await copyToClipboard(`${shareText}\n${shareUrl}`);
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

  if (!selectedVenueId || !venue) return null;

  const visibleFriends = friendsAtVenue.slice(0, 4);
  const remainingCount = friendsAtVenue.length - visibleFriends.length;

  // Only use Google venue photos (not yap/UGC) for the banner — UGC may be unrelated content
  const venuePhotos = googlePhotos;
  const hasPhoto = venuePhotos.length > 0;

  // Hide distance when user is far from the venue's city (>10mi = likely different city)
  const distNum = parseFloat(distance);
  const showDistance = !isNaN(distNum) && distNum <= 10;

  // Metadata line: type · neighborhood · distance
  const typeInfo = venue.type ? getVenueTypeDisplay(venue.type) : null;
  const metaParts: string[] = [];
  if (typeInfo) metaParts.push(typeInfo.label);
  if (venue.neighborhood) metaParts.push(venue.neighborhood);
  if (showDistance) metaParts.push(`${distance} mi`);
  const metaLine = metaParts.join(' \u00b7 ');

  // Friend popover (shared between "here" and "planning" sections)
  const renderFriendList = (friends: FriendAtVenue[], label: string) => (
    <PopoverContent className="w-56 p-2 bg-[#1a0f2e] border border-[#a855f7]/40 rounded-xl z-[400]" align="start">
      <p className="text-white/60 text-xs px-2 mb-2">{label}</p>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {friends.map((friend) => (
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
              <AvatarImage src={friend.avatar_url || undefined} />
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
  );

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
              className="relative w-full max-w-[390px] flex flex-col bg-[#0d0a18] border border-white/10 rounded-3xl overflow-hidden pointer-events-auto animate-card-lift"
              {...swipeHandlers}
            >
              {/* ── ZONE 1: Identity (banner + title + meta) ── */}
              <div className="relative">
                {/* Banner — 120px cap, or gradient placeholder */}
                {hasPhoto ? (
                  <div className="relative w-full h-[120px] overflow-hidden rounded-t-3xl">
                    <img
                      src={venuePhotos[0]}
                      alt={venue.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a18] via-[#0d0a18]/40 to-transparent pointer-events-none" />
                  </div>
                ) : (
                  <div className="relative w-full h-[120px] overflow-hidden rounded-t-3xl bg-gradient-to-br from-[#a855f7]/25 via-[#1a0f2e] to-[#d4ff00]/15 flex items-center justify-center">
                    <span className="text-5xl font-bold text-white/20">{venue.name[0]}</span>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a18] via-transparent to-transparent pointer-events-none" />
                  </div>
                )}

                {/* Close + menu overlaid on banner */}
                <button
                  onClick={closeVenueCard}
                  className="absolute right-3 top-3 z-20 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <CloseIcon className="h-4 w-4 text-white" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger className="absolute left-3 top-3 z-20 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors">
                    <MoreVertical className="h-4 w-4 text-white/80" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-[#1a0f2e] border-[#a855f7]/40">
                    <DropdownMenuItem onClick={() => setShowReportDialog(true)} className="text-white hover:bg-[#a855f7]/20 cursor-pointer">
                      <Flag className="h-4 w-4 mr-2" /> Report Venue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Title overlaid at bottom of banner */}
                <div className="absolute bottom-0 left-0 right-0 px-5 pb-3">
                  {venue.is_map_promoted && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-1.5 rounded-full text-[10px] font-medium bg-[#d4ff00]/15 text-[#d4ff00] border border-[#d4ff00]/20">
                      Featured Tonight
                    </span>
                  )}
                  <h2 className="text-xl font-bold text-white leading-tight">{venue.name}</h2>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 pt-2 pb-5">
                {/* Meta line */}
                <p className="text-xs text-white/45 mb-4">{metaLine}</p>

                {/* ── ZONE 2: Social (who's here + CTA) ── */}
                <div className="mb-4">
                  {friendsAtVenue.length > 0 ? (
                    <div className="flex items-center gap-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex -space-x-2 cursor-pointer hover:opacity-90 transition-opacity">
                            {visibleFriends.map((friend) => (
                              <Avatar key={friend.id} className="w-9 h-9 border-2 border-[#0d0a18]">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#a855f7] text-white text-xs">
                                  {friend.display_name[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {remainingCount > 0 && (
                              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#a855f7]/30 border-2 border-[#0d0a18] text-[10px] text-white font-medium">
                                +{remainingCount}
                              </div>
                            )}
                          </button>
                        </PopoverTrigger>
                        {renderFriendList(friendsAtVenue, `Friends at ${venue.name}`)}
                      </Popover>
                      <span className="text-sm text-white/60">
                        {friendsAtVenue.length} friend{friendsAtVenue.length !== 1 ? 's' : ''} here
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-[#d4ff00]/80">
                      Be the first spotted here tonight
                    </p>
                  )}
                </div>

                {/* Friends Planning */}
                {friendsPlanning.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex -space-x-2 cursor-pointer hover:opacity-90 transition-opacity">
                            {friendsPlanning.slice(0, 4).map((friend) => (
                              <Avatar key={friend.id} className="w-9 h-9 border-2 border-[#0d0a18]">
                                <AvatarImage src={friend.avatar_url || undefined} />
                                <AvatarFallback className="bg-[#a855f7]/70 text-white text-xs">
                                  {friend.display_name[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {friendsPlanning.length > 4 && (
                              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#a855f7]/30 border-2 border-[#0d0a18] text-[10px] text-white font-medium">
                                +{friendsPlanning.length - 4}
                              </div>
                            )}
                          </button>
                        </PopoverTrigger>
                        {renderFriendList(friendsPlanning, 'Friends planning to go')}
                      </Popover>
                      <span className="text-sm text-white/60">
                        {friendsPlanning.length} friend{friendsPlanning.length !== 1 ? 's' : ''} planning
                      </span>
                    </div>
                  </div>
                )}

                {/* Primary CTA */}
                <Button
                  onClick={() => { closeVenueCard(); openInviteModal(venue.id, venue.name); }}
                  className="w-full mb-3 h-11 bg-[#d4ff00] text-black font-semibold hover:bg-[#d4ff00]/90 transition-colors rounded-xl"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite Friends Here
                </Button>

                {/* ── ZONE 3: Utility (icon row + collapsed extras) ── */}
                <div className="flex items-center gap-2 mb-3">
                  {/* Directions */}
                  <button
                    onClick={handleMapPinClick}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] text-white/60 text-xs transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Directions
                  </button>
                  {/* Share */}
                  <button
                    onClick={handleShareVenue}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] text-white/60 text-xs transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                  {/* Wishlist */}
                  <button
                    onClick={handleWishlistToggle}
                    className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] transition-colors"
                    aria-label={isInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                  >
                    {isInWishlist ? (
                      <BookmarkCheck className="w-4 h-4 text-[#d4ff00]" />
                    ) : (
                      <Bookmark className="w-4 h-4 text-white/50" />
                    )}
                  </button>
                  {/* Yap shortcut */}
                  <button
                    onClick={() => { closeVenueCard(); navigate('/messages', { state: { activeTab: 'yap', venueName: venue.name } }); }}
                    className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/[0.08] text-[#d4ff00]/70 text-xs font-medium transition-colors ml-auto"
                  >
                    Yap <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* More Info — collapsed by default */}
                <Collapsible open={moreInfoOpen} onOpenChange={setMoreInfoOpen}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between py-2 text-white/40 hover:text-white/60 transition-colors text-xs">
                      <span>More Info</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreInfoOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-3">
                    {selectedVenueId && <VenueEventsSection venueId={selectedVenueId} />}

                    {/* Hours */}
                    {venueHours && !loadingHours && (
                      <p className="text-xs text-white/40">
                        {venueHours.isOpen ? 'Open now' : 'Closed'}
                        {venueHours.displayText ? ` \u00b7 ${venueHours.displayText}` : ''}
                      </p>
                    )}

                    {/* Trending Nearby */}
                    {similarVenues.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-white/50 mb-1.5">Trending Nearby</h4>
                        <div className="space-y-1.5">
                          {similarVenues.map((sv) => (
                            <button
                              key={sv.id}
                              onClick={() => { closeVenueCard(); setTimeout(() => openVenueCard(sv.id), 100); }}
                              className="w-full p-2.5 bg-white/[0.03] rounded-lg hover:bg-white/[0.06] transition-colors text-left"
                            >
                              <p className="text-white text-sm font-medium">{sv.name}</p>
                              <p className="text-[10px] text-white/40">{sv.neighborhood}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {googleRating && (
                      <p className="text-[10px] text-white/30 text-center pb-1">
                        {googleRating.toFixed(1)} on Google ({googleRatingsCount.toLocaleString()})
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </>
      )}

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
