import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard, FriendCardData } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useBootstrapMode } from '@/hooks/useBootstrapMode';
import { useUserCity } from '@/hooks/useUserCity';
import { useAutoVenueTracking } from '@/hooks/useAutoVenueTracking';
import { CITY_CENTERS } from '@/lib/city-detection';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, Crosshair, MapPin, MapPinOff, Bell, ChevronDown, Search, X, SlidersHorizontal, ArrowLeft, Users, Building2, Target, Home, Map as MapIcon, Music, Wine, Beer, Building } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { NotificationBadge } from '@/components/NotificationBadge';
import { FriendsPlanning } from '@/components/FriendsPlanning';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useToast } from '@/hooks/use-toast';
import { CityBadge } from '@/components/CityBadge';
import { logger } from '@/lib/logger';
import { escapeHtml, escapeUrl } from '@/lib/html-escape';
import { QuickStatusSheet } from '@/components/QuickStatusSheet';
import { UpdateSpotSheet } from '@/components/UpdateSpotSheet';
import { VenueMoveBanner } from '@/components/VenueMoveBanner';
import { PlanningReadyBanner } from '@/components/PlanningReadyBanner';
import { useVenueArrivalNudge, type VenueShiftData } from '@/hooks/useVenueArrivalNudge';
import { FriendSearchModal } from '@/components/FriendSearchModal';

interface FriendLocation {
  user_id: string;
  lat: number;
  lng: number;
  venue_name: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  };
  relationshipType?: 'close' | 'direct' | 'mutual';
  is_private_party?: boolean;
  party_neighborhood?: string | null;
}

interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  lat: number;
  lng: number;
  is_demo: boolean;
  heatScore: number;
  is_map_promoted?: boolean;
}

export default function Map() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { bootstrapEnabled } = useBootstrapMode();
  const { city } = useUserCity();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  
  // Venue arrival nudge with shift detection callback
  const handleVenueShift = useCallback((data: VenueShiftData) => {
    if (!venueMoveDismissedRef.current) {
      setVenueShiftData(data);
      setShowVenueMoveBanner(true);
    }
  }, []);
  useVenueArrivalNudge(handleVenueShift);
  
  useAutoVenueTracking(); // Trigger auto-venue tracking on map view
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [planningFriends, setPlanningFriends] = useState<{ user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueFilter, setVenueFilter] = useState<'all' | 'nightclub' | 'cocktail_bar' | 'bar' | 'rooftop'>('all');
  // Use Map object keyed by user_id to prevent duplicate markers
  const friendMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const venueMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userProfile, setUserProfile] = useState<{ avatar_url: string | null; display_name: string } | null>(null);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [selectedCluster, setSelectedCluster] = useState<{
    friends: FriendLocation[];
    venueName: string;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<'both' | 'friends' | 'venues'>('both');
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchFilterPeople, setSearchFilterPeople] = useState(true);
  const [searchFilterVenues, setSearchFilterVenues] = useState(true);
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | 'close' | 'friends_only'>('all');
  const friendsListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Status pill & quick-switch state
  const [showQuickStatus, setShowQuickStatus] = useState(false);
  const [showUpdateSpot, setShowUpdateSpot] = useState(false);
  const [currentUserStatus, setCurrentUserStatus] = useState<string | null>(null);
  const [currentUserVenue, setCurrentUserVenue] = useState<string | null>(null);
  
  // Smart venue prompt for planning users
  const [smartPromptVenue, setSmartPromptVenue] = useState<{ id: string; name: string; lat: number; lng: number } | null>(null);
  const [showSmartPrompt, setShowSmartPrompt] = useState(false);
  const smartPromptDismissedRef = useRef<Set<string>>(new Set());
  
  // Venue move banner state
  const [venueShiftData, setVenueShiftData] = useState<VenueShiftData | null>(null);
  const [showVenueMoveBanner, setShowVenueMoveBanner] = useState(false);
  const venueMoveDismissedRef = useRef(false);
  
  // Planning ready banner — once per session
  const [showPlanningReady, setShowPlanningReady] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const planningReadyShownRef = useRef(false);
  const [styleLoaded, setStyleLoaded] = useState(false);
  
  // Use ref for city to prevent callback recreation
  const cityRef = useRef(city);
  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  // Use ref for demoEnabled to ensure fetch always has latest value
  const demoEnabledRef = useRef(demoEnabled);
  useEffect(() => {
    demoEnabledRef.current = demoEnabled;
  }, [demoEnabled]);

  // Stable ref for the fetch function to avoid callback recreation
  const fetchFriendsLocationsRef = useRef<() => Promise<void>>();
  
  useEffect(() => {
    if (user) {
      fetchFriendsLocations();
    }
  }, [user, demoEnabled, city]);

  // Debounced fetch to prevent thundering herd on realtime events
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Stable debounced function that uses ref - never recreated
  const debouncedFetchFriendsLocations = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      fetchFriendsLocationsRef.current?.();
    }, 500);
  }, []); // Empty deps - truly stable

  // Real-time subscription for location updates - CONSOLIDATED into 1 channel
  useEffect(() => {
    if (!user) return;

    // Single unified channel for all map-related realtime updates
    const mapRealtimeChannel = supabase
      .channel('map-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          console.log('Profile location updated:', payload);
          debouncedFetchFriendsLocations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'night_statuses' },
        (payload) => {
          console.log('Night status updated:', payload);
          debouncedFetchFriendsLocations();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkins' },
        (payload) => {
          console.log('Checkin updated:', payload);
          debouncedFetchFriendsLocations();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'venues' },
        (payload) => {
          console.log('Venue promotion updated:', payload);
          debouncedFetchFriendsLocations();
        }
      )
      .subscribe();

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      supabase.removeChannel(mapRealtimeChannel);
    };
  }, [user]); // Removed debouncedFetchFriendsLocations from deps - it's stable now
  
  // Keep the ref updated with the latest fetch function
  useEffect(() => {
    fetchFriendsLocationsRef.current = fetchFriendsLocations;
  });

  const fetchFriendsLocations = async () => {
    if (!user) return;
    
    setIsLoadingFriends(true);

    try {
      // Get current user's profile to check their location
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('is_out, last_known_lat, last_known_lng, location_sharing_level, avatar_url, display_name')
        .eq('id', user.id)
        .single();

      // Store user profile for avatar marker
      if (myProfile) {
        setUserProfile({
          avatar_url: myProfile.avatar_url,
          display_name: myProfile.display_name || 'Me'
        });
      }

      // Update user's location state
      if (myProfile?.is_out && myProfile.last_known_lat && myProfile.last_known_lng) {
        console.log('Setting user location:', { lat: myProfile.last_known_lat, lng: myProfile.last_known_lng, is_out: myProfile.is_out });
        setUserLocation({ lat: myProfile.last_known_lat, lng: myProfile.last_known_lng });
      } else {
        console.log('User location not set - is_out:', myProfile?.is_out, 'has coords:', !!myProfile?.last_known_lat);
        setUserLocation(null);
      }

      // Fetch current night status for status pill
      const { data: nightStatus } = await supabase
        .from('night_statuses')
        .select('status, venue_name, venue_id')
        .eq('user_id', user?.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      setCurrentUserStatus(nightStatus?.status || null);
      setCurrentUserVenue(nightStatus?.venue_name || null);

      // Show planning-ready banner once per session
      if (nightStatus?.status === 'planning' && !planningReadyShownRef.current) {
        planningReadyShownRef.current = true;
        setShowPlanningReady(true);
      }

      // Smart prompt: if planning, check if near a venue
      if (nightStatus?.status === 'planning' && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true })
          );
          const { data: nearbyVenues } = await supabase.rpc('find_nearest_venue', {
            user_lat: pos.coords.latitude,
            user_lng: pos.coords.longitude,
            radius_meters: 200,
          });
          if (nearbyVenues && nearbyVenues.length > 0 && !smartPromptDismissedRef.current.has(nearbyVenues[0].venue_id)) {
            setSmartPromptVenue({
              id: nearbyVenues[0].venue_id,
              name: nearbyVenues[0].venue_name,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            setShowSmartPrompt(true);
          }
        } catch {
          // GPS not available, skip smart prompt
        }
      }

      let friendLocations: FriendLocation[] = [];
      let friendIds: string[] = [];

      // When demo mode is ON, fetch demo users from database
      if (demoEnabledRef.current) {
        // Fetch demo users who are "out" from night_statuses joined with profiles
        const [{ data: demoStatuses }, { data: planningDemoStatuses }, { data: cityVenues }] = await Promise.all([
          supabase
            .from('night_statuses')
            .select(`
              user_id,
              lat,
              lng,
              venue_name,
              profiles!inner(display_name, avatar_url, is_demo)
            `)
            .eq('status', 'out')
            .eq('profiles.is_demo', true)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString()),
          // Also fetch planning demo users
          supabase
            .from('night_statuses')
            .select(`
              user_id,
              planning_neighborhood,
              profiles!inner(display_name, avatar_url, is_demo)
            `)
            .eq('status', 'planning')
            .eq('profiles.is_demo', true)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString()),
          // Fetch venues for current city to filter demo users
          supabase
            .from('venues')
            .select('name')
            .eq('city', cityRef.current)
        ]);

        const cityVenueNames = new Set(cityVenues?.map(v => v.name.toLowerCase()) || []);

        // Filter demo users by city (matching venue name to city's venues)
        const filteredDemoStatuses = (demoStatuses || []).filter((status: any) => 
          status.venue_name && cityVenueNames.has(status.venue_name.toLowerCase())
        );

        // Deduplicate by display_name (keep first occurrence)
        const seenNames = new Set<string>();
        const relationshipTypes: ('close' | 'direct' | 'mutual')[] = ['close', 'direct', 'mutual'];
        
        friendLocations = filteredDemoStatuses
          .filter((status: any) => {
            const name = status.profiles?.display_name;
            if (!name || seenNames.has(name)) return false;
            seenNames.add(name);
            return true;
          })
          .map((status: any, index: number) => ({
            user_id: status.user_id,
            lat: status.lat,
            lng: status.lng,
            venue_name: status.venue_name || 'Out',
            profiles: {
              display_name: status.profiles?.display_name || 'Unknown',
              avatar_url: status.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${status.profiles?.display_name}`,
            },
            // Cycle through relationship types for visual variety
            relationshipType: relationshipTypes[index % relationshipTypes.length],
          }));

        friendIds = friendLocations.map(f => f.user_id);

        // Set planning friends from demo data
        const planningFriendsData = (planningDemoStatuses || []).map((status: any) => ({
          user_id: status.user_id,
          display_name: status.profiles?.display_name || 'Friend',
          avatar_url: status.profiles?.avatar_url || null,
          planning_neighborhood: status.planning_neighborhood || null,
        }));
        setPlanningFriends(planningFriendsData);
      } else {
        // Normal mode: show real friends only - use cached friend IDs if available
        const cachedIds: string[] | undefined = (window as any).__cachedFriendIds;
        
        if (cachedIds) {
          friendIds = cachedIds;
        } else {
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

          friendIds = [
            ...(sentFriendships?.map(f => f.friend_id) || []),
            ...(receivedFriendships?.map(f => f.user_id) || [])
          ];
        }

        if (friendIds.length > 0) {
          // Get friends' profiles with location data via safe RPC function
          // This function properly masks location data based on can_see_location permissions
          let { data: allProfiles, error: profilesError } = await supabase.rpc('get_profiles_safe');
          
          // Retry once on 403 (auth session may not be ready on cold load)
          if (profilesError && String(profilesError.code) === '403') {
            await new Promise(r => setTimeout(r, 1000));
            const retry = await supabase.rpc('get_profiles_safe');
            allProfiles = retry.data;
            if (retry.error) {
              console.error('Map profiles retry failed:', retry.error.message);
            }
          }
          
          // Filter to only friends who are out with valid location data
          let friendProfiles = (allProfiles || [])
            .filter((p: any) => 
              friendIds.includes(p.id) && 
              p.is_out === true && 
              p.last_known_lat !== null && 
              p.last_known_lng !== null
            );
          
          // Only filter out demo users when demo mode is OFF (bootstrap mode)
          if (!demoEnabled) {
            friendProfiles = friendProfiles.filter((p: any) => p.is_demo === false);
          }

          // Get friends' night statuses to determine status type (including planning_neighborhood)
          const { data: statuses } = await supabase
            .from('night_statuses')
            .select('user_id, venue_name, status, planning_neighborhood, is_private_party, party_neighborhood, lat, lng')
            .in('user_id', friendIds)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString());

          const venueMap: Record<string, string> = {};
          const privatePartyMap: Record<string, { is_private_party: boolean; party_neighborhood: string | null; lat: number | null; lng: number | null }> = {};
          const planningFriendsData: { user_id: string; display_name: string; avatar_url: string | null; planning_neighborhood?: string | null }[] = [];
          
          statuses?.forEach(s => {
            if (s.status === 'planning') {
              // Find the profile for this planning friend
              const profile = (allProfiles || []).find((p: any) => p.id === s.user_id);
              // Filter out demo users in bootstrap mode (when demo mode is OFF)
              const isDemoUser = profile?.is_demo === true;
              const shouldExclude = bootstrapEnabled && !demoEnabled && isDemoUser;
              
              if (profile && friendIds.includes(s.user_id) && !shouldExclude) {
                planningFriendsData.push({
                  user_id: s.user_id,
                  display_name: profile.display_name || 'Friend',
                  avatar_url: profile.avatar_url,
                  planning_neighborhood: s.planning_neighborhood || null,
                });
              }
            } else if (s.venue_name) {
              venueMap[s.user_id] = s.venue_name;
            }
            // Track private party data
            if (s.is_private_party) {
              privatePartyMap[s.user_id] = {
                is_private_party: true,
                party_neighborhood: s.party_neighborhood || null,
                lat: s.lat || null,
                lng: s.lng || null,
              };
            }
          });
          
          setPlanningFriends(planningFriendsData);

          // Get relationship types (close friends, mutual friends) - BATCHED QUERY
          const { data: closeFriends } = await supabase
            .from('close_friends')
            .select('close_friend_id')
            .eq('user_id', user.id);

          const closeFriendIds = new Set(closeFriends?.map(cf => cf.close_friend_id) || []);

          // Batch query: Get all friendships for all friends in one query
          const { data: allFriendships } = await supabase
            .from('friendships')
            .select('user_id, friend_id')
            .eq('status', 'accepted')
            .in('user_id', friendIds);

          // Build a map of each friend's connections
          const friendConnections: Record<string, Set<string>> = {};
          allFriendships?.forEach(f => {
            if (!friendConnections[f.user_id]) {
              friendConnections[f.user_id] = new Set();
            }
            friendConnections[f.user_id].add(f.friend_id);
          });

          // Determine relationship type for each friend in-memory (no N+1)
          const relationshipTypes: Record<string, 'close' | 'direct' | 'mutual'> = {};
          const friendIdSet = new Set(friendIds);
          
          for (const friendId of friendIds) {
            if (closeFriendIds.has(friendId)) {
              relationshipTypes[friendId] = 'close';
            } else {
              // Check if mutual friend: does this friend have connections to other friends?
              const connections = friendConnections[friendId] || new Set();
              const hasCommonFriend = [...connections].some(connId => friendIdSet.has(connId) && connId !== friendId);
              relationshipTypes[friendId] = hasCommonFriend ? 'mutual' : 'direct';
            }
          }

          // RLS policies handle visibility filtering - no client-side filtering needed
          friendLocations = (friendProfiles || []).map((friend: any) => {
            const ppData = privatePartyMap[friend.id];
            const isPrivateParty = ppData?.is_private_party === true;
            
            // For private party friends, jitter coordinates for privacy (~1km precision)
            let lat = friend.last_known_lat;
            let lng = friend.last_known_lng;
            if (isPrivateParty && ppData?.lat && ppData?.lng) {
              lat = Math.round(ppData.lat * 100) / 100 + (Math.random() - 0.5) * 0.002;
              lng = Math.round(ppData.lng * 100) / 100 + (Math.random() - 0.5) * 0.002;
            }
            
            const venueName = isPrivateParty
              ? `Private Party${ppData?.party_neighborhood ? ` (${ppData.party_neighborhood})` : ''}`
              : venueMap[friend.id] || 'Out';

            return {
              user_id: friend.id,
              lat,
              lng,
              venue_name: venueName,
              profiles: {
                display_name: friend.display_name || 'Unknown',
                avatar_url: friend.avatar_url,
              },
              relationshipType: relationshipTypes[friend.id] || 'direct',
              is_private_party: isPrivateParty,
              party_neighborhood: ppData?.party_neighborhood || null,
            };
          });
        }
      }

      setFriends(friendLocations);
      setIsLoadingFriends(false);
      
      logger.mapLoad(friendLocations.length, 0); // Log successful friends fetch

      // Fetch venues and calculate heat scores
      await fetchVenuesWithHeatScores(friendIds);
    } catch (error) {
      logger.apiError('map:friends_fetch', error);
      setIsLoadingFriends(false);
    }
  };

  // Simplified heat score calculation using popularity_rank instead of expensive queries
  const fetchVenuesWithHeatScores = async (friendIds: string[]) => {
    try {
      // Fetch venues filtered by city (server-side filtering)
      const { data: venuesData } = await supabase
        .from('venues')
        .select('*')
        .eq('city', cityRef.current);

      if (!venuesData) return;

      // Use popularity_rank as heat score (inverted: lower rank = higher heat)
      // This eliminates N+1 queries for posts/yaps per venue
      const venuesWithHeat = venuesData.map((venue) => {
        // Count friends at this venue (from already-loaded friends state)
        const friendsAtVenue = friends.filter(
          (f) => f.venue_name.toLowerCase() === venue.name.toLowerCase()
        ).length;

        // Heat score = friends present + popularity (100 - rank to invert)
        const popularityScore = 100 - (venue.popularity_rank || 50);
        const heatScore = (friendsAtVenue * 10) + popularityScore;

        return {
          ...venue,
          heatScore,
          is_map_promoted: venue.is_map_promoted || false,
        };
      });

      // Venues already filtered by city in the query
      const filteredVenues = venuesWithHeat;

      // Sort by heat score (descending)
      filteredVenues.sort((a, b) => b.heatScore - a.heatScore);

      setVenues(filteredVenues);
      logger.info('map:venues_load', { venueCount: filteredVenues.length, city: cityRef.current });
    } catch (error) {
      logger.apiError('map:venues_fetch', error);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      logger.error('map:init_failed', { reason: 'MAPBOX token missing' });
      return;
    }
    
    logger.info('map:init', { city });

    mapboxgl.accessToken = mapboxToken;
    
    const cityCenter = CITY_CENTERS[city];
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [cityCenter.lng, cityCenter.lat],
      zoom: 13,
    });

    // Track zoom level for clustering behavior
    map.current.on('zoom', () => {
      const zoom = map.current?.getZoom() || 13;
      setCurrentZoom(zoom);
      // Close cluster popover when zooming
      setSelectedCluster(null);
    });
    
    // Toggle focus mode and close cluster popover when clicking on map
    map.current.on('click', () => {
      setSelectedCluster(null);
      setFocusMode(prev => !prev);
    });

    // Track style loaded state for venue rendering
    map.current.on('style.load', () => {
      setStyleLoaded(true);
    });
    if (map.current.isStyleLoaded()) {
      setStyleLoaded(true);
    }

    // Listen for custom event to center map on venue
    const handleCenterMapOnVenue = (e: Event) => {
      const customEvent = e as CustomEvent<{ lat: number; lng: number }>;
      if (map.current && customEvent.detail) {
        map.current.flyTo({
          center: [customEvent.detail.lng, customEvent.detail.lat],
          zoom: 15,
          duration: 1500,
        });
      }
    };

    window.addEventListener('centerMapOnVenue', handleCenterMapOnVenue);

    return () => {
      window.removeEventListener('centerMapOnVenue', handleCenterMapOnVenue);
      // Clean up all markers using Map
      friendMarkersRef.current.forEach(marker => marker.remove());
      friendMarkersRef.current.clear();
      venueMarkersRef.current.forEach(marker => marker.remove());
      venueMarkersRef.current.clear();
      userMarkerRef.current?.remove();
      map.current?.remove();
    };
  }, []);

  // Re-center map when city changes
  useEffect(() => {
    if (!map.current) return;
    
    const cityCenter = CITY_CENTERS[city];
    map.current.flyTo({
      center: [cityCenter.lng, cityCenter.lat],
      zoom: 13,
      duration: 1500, // Smooth 1.5 second animation
    });
  }, [city]);

  // Add user's marker
  useEffect(() => {
    if (!map.current || !userLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    // Remove old marker
    userMarkerRef.current?.remove();

    // Create user marker with personal avatar and yellow glow
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.style.width = '60px';
    el.style.height = '60px';
    el.style.cursor = 'pointer';
    el.style.zIndex = '15';
    
    const avatarUrl = escapeUrl(userProfile?.avatar_url) || '/placeholder.svg';
    const initials = escapeHtml(userProfile?.display_name?.charAt(0).toUpperCase()) || 'M';
    
    el.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
        <!-- Yellow pulsing glow to distinguish from friends -->
        <div style="position: absolute; inset: -4px; border-radius: 50%; background: radial-gradient(circle, rgba(212, 255, 0, 0.3) 0%, transparent 70%); animation: pulse 2s infinite;"></div>
        <!-- Avatar with yellow border (vs purple for friends) -->
        <div style="width: 50px; height: 50px; border-radius: 50%; overflow: hidden; border: 3px solid #d4ff00; box-shadow: 0 0 12px rgba(212, 255, 0, 0.5); background: #1a0f2e;">
          <img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
          <div style="display: none; width: 100%; height: 100%; background: #d4ff00; align-items: center; justify-content: center; font-weight: bold; color: #0a0118; font-size: 18px;">
            ${initials}
          </div>
        </div>
      </div>
    `;

    // Add tap interaction to open profile page
    el.addEventListener('click', () => {
      navigate('/profile');
    });

    userMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [userLocation, userProfile]);

  // Smart marker diffing with clustering for groups
  // ~5 meters = 0.000045 degrees (venue-level accuracy)
  const CLUSTER_THRESHOLD = 0.000045;
  const SPREAD_RADIUS = 0.0002; // ~20m spread when expanded

  useEffect(() => {
    if (!map.current || isLoadingFriends) return;

    // Clear all markers first for clean re-render
    friendMarkersRef.current.forEach(marker => marker.remove());
    friendMarkersRef.current.clear();

    // If venues-only mode, don't render friend markers
    if (layerVisibility === 'venues') {
      return;
    }

    // Apply relationship filter
    const filteredFriends = relationshipFilter === 'close'
      ? friends.filter(f => f.relationshipType === 'close')
      : friends;

    // At high zoom (18+), don't cluster - show all individual avatars
    const shouldCluster = currentZoom < 18;

    // Group friends by location (within 5m threshold)
    const clusters: FriendLocation[][] = [];
    const assigned = new Set<string>();

    filteredFriends.forEach((friend) => {
      if (assigned.has(friend.user_id)) return;
      
      const cluster = [friend];
      assigned.add(friend.user_id);
      
      if (shouldCluster) {
        filteredFriends.forEach((other) => {
          if (assigned.has(other.user_id)) return;
          const latDiff = Math.abs(friend.lat - other.lat);
          const lngDiff = Math.abs(friend.lng - other.lng);
          if (latDiff < CLUSTER_THRESHOLD && lngDiff < CLUSTER_THRESHOLD) {
            cluster.push(other);
            assigned.add(other.user_id);
          }
        });
      }
      
      clusters.push(cluster);
    });

    // Z-index by relationship type
    const getZIndex = (relType?: string) => {
      if (relType === 'close') return '14';
      if (relType === 'direct') return '11';
      return '10'; // mutual
    };

    // Get highest priority relationship in a cluster
    const getClusterZIndex = (cluster: FriendLocation[]) => {
      if (cluster.some(f => f.relationshipType === 'close')) return '14';
      if (cluster.some(f => f.relationshipType === 'direct')) return '11';
      return '10';
    };

    // Sort cluster by priority: close > direct > mutual
    const sortByPriority = (a: FriendLocation, b: FriendLocation) => {
      const order = { close: 0, direct: 1, mutual: 2 };
      return (order[a.relationshipType || 'direct'] || 1) - (order[b.relationshipType || 'direct'] || 1);
    };

    // Helper to create individual avatar marker (reduced size: 40px)
    const createAvatarMarker = (friend: FriendLocation, lng: number, lat: number) => {
      const el = document.createElement('div');
      el.className = 'friend-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.cursor = 'pointer';
      el.style.zIndex = getZIndex(friend.relationshipType);
      
      const ringColors = {
        close: { border: '#d4ff00', shadow: 'rgba(212, 255, 0, 0.35)', badge: '💛' },
        direct: { border: '#a855f7', shadow: 'rgba(168, 85, 247, 0.35)', badge: '' },
        mutual: { border: '#6366f1', shadow: 'rgba(99, 102, 241, 0.35)', badge: '🔗' },
      };
      
      const colors = ringColors[friend.relationshipType || 'direct'];
      
      const safeAvatarUrl = escapeUrl(friend.profiles?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(friend.profiles?.display_name || 'user')}`;
      const safeDisplayName = escapeHtml(friend.profiles?.display_name);
      
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;">
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${colors.border}; box-shadow: 0 0 8px ${colors.shadow};"></div>
          <img 
            src="${safeAvatarUrl}" 
            style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; padding: 2px; border: 2px solid white;"
            alt="${safeDisplayName}"
          />
          ${colors.badge ? `
            <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; background: #1a0f2e; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid ${colors.border}; font-size: 8px;">
              ${colors.badge}
            </div>
          ` : ''}
        </div>
      `;

      el.addEventListener('click', () => {
        const friendCardData: FriendCardData = {
          userId: friend.user_id,
          displayName: friend.profiles?.display_name || 'Friend',
          avatarUrl: friend.profiles?.avatar_url || null,
          venueName: friend.venue_name,
          lat: friend.lat,
          lng: friend.lng,
          relationshipType: friend.relationshipType,
        };
        openFriendCard(friendCardData);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      friendMarkersRef.current.set(friend.user_id, marker);
    };

    // Helper to create house icon marker for private party friends
    const createHouseMarker = (friend: FriendLocation, lng: number, lat: number) => {
      const el = document.createElement('div');
      el.className = 'friend-marker house-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.cursor = 'pointer';
      el.style.zIndex = getZIndex(friend.relationshipType);
      
      const ringColors = {
        close: { border: '#d4ff00', shadow: 'rgba(212, 255, 0, 0.35)' },
        direct: { border: '#a855f7', shadow: 'rgba(168, 85, 247, 0.35)' },
        mutual: { border: '#6366f1', shadow: 'rgba(99, 102, 241, 0.35)' },
      };
      
      const colors = ringColors[friend.relationshipType || 'direct'];
      const tooltip = friend.party_neighborhood 
        ? `${escapeHtml(friend.profiles?.display_name)} — ${escapeHtml(friend.party_neighborhood)}`
        : escapeHtml(friend.profiles?.display_name);
      
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;" title="${tooltip}">
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${colors.border}; box-shadow: 0 0 8px ${colors.shadow}; background: rgba(26, 15, 46, 0.95);"></div>
          <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${colors.border}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
              <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        const friendCardData: FriendCardData = {
          userId: friend.user_id,
          displayName: friend.profiles?.display_name || 'Friend',
          avatarUrl: friend.profiles?.avatar_url || null,
          venueName: friend.venue_name,
          lat: friend.lat,
          lng: friend.lng,
          relationshipType: friend.relationshipType,
        };
        openFriendCard(friendCardData);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      friendMarkersRef.current.set(friend.user_id, marker);
    };

    // Render clusters
    clusters.forEach((cluster) => {
      const clusterKey = `cluster-${cluster.map(f => f.user_id).sort().join('-')}`;
      const centerLat = cluster[0].lat;
      const centerLng = cluster[0].lng;

      if (cluster.length >= 2 && shouldCluster) {
        // Sort by priority so highest-priority friend is shown first
        const sorted = [...cluster].sort(sortByPriority);
        const clusterZIndex = getClusterZIndex(cluster);

        if (cluster.length <= 3) {
          // Compact cluster for 2-3 friends: show top friend avatar with count badge
          const topFriend = sorted[0];
          const el = document.createElement('div');
          el.className = 'cluster-marker';
          el.style.width = '46px';
          el.style.height = '46px';
          el.style.cursor = 'pointer';
          el.style.zIndex = clusterZIndex;
          
          const ringColors: Record<string, { border: string; shadow: string }> = {
            close: { border: '#d4ff00', shadow: 'rgba(212, 255, 0, 0.35)' },
            direct: { border: '#a855f7', shadow: 'rgba(168, 85, 247, 0.35)' },
            mutual: { border: '#6366f1', shadow: 'rgba(99, 102, 241, 0.35)' },
          };
          const colors = ringColors[topFriend.relationshipType || 'direct'];
          const safeAvatarUrl = escapeUrl(topFriend.profiles?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(topFriend.profiles?.display_name || 'user')}`;
          
          el.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
              <div style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${colors.border}; box-shadow: 0 0 8px ${colors.shadow};"></div>
              <img 
                src="${safeAvatarUrl}" 
                style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; padding: 2px; border: 2px solid white;"
              />
              <div style="position: absolute; bottom: -4px; right: -4px; min-width: 20px; height: 20px; background: #a855f7; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0 5px; font-size: 11px; font-weight: 700; color: white; border: 2px solid #1a0f2e;">
                ${cluster.length}
              </div>
            </div>
          `;

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const point = map.current!.project([centerLng, centerLat]);
            setSelectedCluster({
              friends: cluster,
              venueName: cluster[0].venue_name,
              screenX: point.x,
              screenY: point.y,
            });
          });

          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([centerLng, centerLat])
            .addTo(map.current!);

          friendMarkersRef.current.set(clusterKey, marker);
        } else {
          // Cluster bubble for 4+ friends (reduced to 56px)
          const el = document.createElement('div');
          el.className = 'cluster-marker';
          el.style.width = '56px';
          el.style.height = '56px';
          el.style.cursor = 'pointer';
          el.style.zIndex = clusterZIndex;
          
          const displayFriends = sorted.slice(0, 3);
          const remainingCount = cluster.length - 3;
          
          const safeAvatar0 = escapeUrl(displayFriends[0]?.profiles?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayFriends[0]?.profiles?.display_name || 'user0')}`;
          const safeAvatar1 = escapeUrl(displayFriends[1]?.profiles?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayFriends[1]?.profiles?.display_name || 'user1')}`;
          const safeAvatar2 = escapeUrl(displayFriends[2]?.profiles?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayFriends[2]?.profiles?.display_name || 'user2')}`;
          
          el.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
              <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(45, 27, 78, 0.95); border: 2px solid rgba(168, 85, 247, 0.5); box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);"></div>
              <img src="${safeAvatar0}" 
                   style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%); width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1.5px solid white;" />
              <img src="${safeAvatar1}" 
                   style="position: absolute; bottom: 12px; left: 8px; width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1.5px solid white;" />
              <img src="${safeAvatar2}" 
                   style="position: absolute; bottom: 12px; right: 8px; width: 18px; height: 18px; border-radius: 50%; object-fit: cover; border: 1.5px solid white;" />
              <div style="position: absolute; bottom: -4px; right: -4px; min-width: 20px; height: 20px; background: #a855f7; border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 0 5px; font-size: 10px; font-weight: 600; color: white; border: 2px solid #1a0f2e;">
                +${remainingCount}
              </div>
            </div>
          `;

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const point = map.current!.project([centerLng, centerLat]);
            setSelectedCluster({
              friends: cluster,
              venueName: cluster[0].venue_name,
              screenX: point.x,
              screenY: point.y,
            });
          });

          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([centerLng, centerLat])
            .addTo(map.current!);

          friendMarkersRef.current.set(clusterKey, marker);
        }
      } else {
        // Single friend - render individually (no offset needed since clusters handle 2+)
        cluster.forEach((friend) => {
          if (friend.is_private_party) {
            createHouseMarker(friend, friend.lng, friend.lat);
          } else {
            createAvatarMarker(friend, friend.lng, friend.lat);
          }
        });
      }
    });
  }, [friends, isLoadingFriends, currentZoom, layerVisibility, relationshipFilter]);

  // Filter venues based on selected filter — clustering handles density
  const typeFilteredVenues = venueFilter === 'all' 
    ? venues 
    : venues.filter(v => v.type === venueFilter);
  
  const filteredVenues = typeFilteredVenues;

  // Render venue markers using Mapbox GL clustering for non-promoted venues
  // and DOM markers for promoted venues (special styling/z-index)
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    if (!styleLoaded) return;

    // If friends-only mode, remove everything
    if (layerVisibility === 'friends') {
      venueMarkersRef.current.forEach(marker => marker.remove());
      venueMarkersRef.current.clear();
      // Remove cluster layers/source if they exist
      if (m.getLayer('venue-cluster-count')) m.removeLayer('venue-cluster-count');
      if (m.getLayer('venue-clusters')) m.removeLayer('venue-clusters');
      if (m.getLayer('venue-unclustered')) m.removeLayer('venue-unclustered');
      if (m.getSource('venues-source')) m.removeSource('venues-source');
      return;
    }

    // Separate promoted vs non-promoted
    const promotedVenues = filteredVenues.filter(v => v.is_map_promoted);
    const nonPromotedVenues = filteredVenues.filter(v => !v.is_map_promoted);

    // Debug log promoted venues
    if (promotedVenues.length > 0) {
      console.log(`[map:promoted] Rendering ${promotedVenues.length} promoted venue(s):`, promotedVenues.map(v => v.name));
    }

    // === GeoJSON clustering for non-promoted venues ===
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: nonPromotedVenues.map((venue, index) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [venue.lng, venue.lat] },
        properties: {
          id: venue.id,
          name: venue.name,
          heatScore: venue.heatScore,
          isTopHot: index < 3 && venue.heatScore > 0,
        },
      })),
    };

    if (m.getSource('venues-source')) {
      // Update existing source data
      (m.getSource('venues-source') as mapboxgl.GeoJSONSource).setData(geojson);
    } else {
      // Add source with clustering
      m.addSource('venues-source', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circles
      m.addLayer({
        id: 'venue-clusters',
        type: 'circle',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#a855f7',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
        },
      });

      // Cluster count labels
      m.addLayer({
        id: 'venue-cluster-count',
        type: 'symbol',
        source: 'venues-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Create custom pin images for unclustered venues
      if (!m.hasImage('venue-pin')) {
        const size = 36;
        const yOffset = 8;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size + 16;
        const ctx = canvas.getContext('2d')!;
        
        // Teardrop/pin shape
        ctx.beginPath();
        ctx.moveTo(size / 2, size + 4 + yOffset);
        ctx.bezierCurveTo(size / 2 - 2, size - 4 + yOffset, 0, size / 2 + yOffset, 0, size / 2 - 4 + yOffset);
        ctx.arc(size / 2, size / 2 - 4 + yOffset, size / 2, Math.PI, 0, false);
        ctx.bezierCurveTo(size, size / 2 + yOffset, size / 2 + 2, size - 4 + yOffset, size / 2, size + 4 + yOffset);
        ctx.closePath();
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // White dot in center
        ctx.beginPath();
        ctx.arc(size / 2, size / 2 - 4 + yOffset, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        m.addImage('venue-pin', { width: canvas.width, height: canvas.height, data: new Uint8Array(imgData.data.buffer) }, { pixelRatio: 2 });
      }

      // Individual unclustered pins — symbol layer with custom pin icon
      m.addLayer({
        id: 'venue-unclustered',
        type: 'symbol',
        source: 'venues-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': 'venue-pin',
          'icon-size': 1,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        },
        paint: {
          'icon-opacity': ['case', ['>', ['get', 'heatScore'], 0], 1, 0.7],
        },
      });

      // Click handler for clusters - zoom in
      m.on('click', 'venue-clusters', (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['venue-clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = m.getSource('venues-source') as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coords = (features[0].geometry as GeoJSON.Point).coordinates;
          m.easeTo({ center: [coords[0], coords[1]] as [number, number], zoom: (zoom ?? 14) + 1 });
        });
      });

      // Click handler for individual pins
      m.on('click', 'venue-unclustered', (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['venue-unclustered'] });
        if (!features.length) return;
        const venueId = features[0].properties?.id;
        if (venueId) openVenueCard(venueId);
      });

      // Cursor styling
      m.on('mouseenter', 'venue-clusters', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'venue-clusters', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseenter', 'venue-unclustered', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'venue-unclustered', () => { m.getCanvas().style.cursor = ''; });
    }

    // === DOM markers for promoted venues only ===
    const currentPromotedIds = new Set(promotedVenues.map(v => v.id));

    // Remove stale promoted markers
    venueMarkersRef.current.forEach((marker, venueId) => {
      if (!currentPromotedIds.has(venueId)) {
        marker.remove();
        venueMarkersRef.current.delete(venueId);
      }
    });

    // Add/update promoted venue markers
    promotedVenues.forEach((venue) => {
      const existing = venueMarkersRef.current.get(venue.id);
      if (existing) {
        existing.setLngLat([venue.lng, venue.lat]);
        return;
      }

      const el = document.createElement('div');
      el.className = 'venue-marker';
      el.style.width = '58px';
      el.style.height = '58px';
      el.style.cursor = 'pointer';
      el.style.zIndex = '30';
      el.dataset.promoted = 'true';

      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <div class="promoted-halo" style="position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(212, 255, 0, 0.12) 0%, transparent 65%);"></div>
          <div style="width: 38px; height: 38px; background: #a855f7; border-radius: 50%; box-shadow: 0 0 8px rgba(212, 255, 0, 0.15); display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(255, 255, 255, 0.8);">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `;

      el.addEventListener('click', () => openVenueCard(venue.id));

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([venue.lng, venue.lat])
        .addTo(m);

      const wrapper = marker.getElement()?.parentElement;
      if (wrapper) wrapper.style.zIndex = '30';

      venueMarkersRef.current.set(venue.id, marker);
    });
  }, [filteredVenues, friends, layerVisibility, styleLoaded]);

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

  const toggleFriendsList = () => {
    if (friends.length > 0) {
      setShowFriendsList(!showFriendsList);
    }
  };

  const handleFriendClick = (friend: FriendLocation) => {
    // Center map on friend
    if (map.current) {
      map.current.flyTo({
        center: [friend.lng, friend.lat],
        zoom: 15,
        duration: 1500,
      });
    }
    // Open friend card
    const friendCardData: FriendCardData = {
      userId: friend.user_id,
      displayName: friend.profiles?.display_name || 'Friend',
      avatarUrl: friend.profiles?.avatar_url || null,
      venueName: friend.venue_name,
      lat: friend.lat,
      lng: friend.lng,
      relationshipType: friend.relationshipType,
    };
    openFriendCard(friendCardData);
  };

  // Get friends with distances sorted
  const friendsWithDistances = userLocation
    ? friends
        .map((friend) => ({
          ...friend,
          distance: calculateDistance(
            userLocation.lat,
            userLocation.lng,
            friend.lat,
            friend.lng
          ),
        }))
        .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
    : friends.map((friend) => ({ ...friend, distance: '--' }));

  // Handle click outside friends list
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        friendsListRef.current &&
        !friendsListRef.current.contains(event.target as Node) &&
        showFriendsList
      ) {
        setShowFriendsList(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFriendsList]);

  const centerOnMyLocation = () => {
    if (!map.current) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Update user location state to show avatar marker
          setUserLocation({ lat: latitude, lng: longitude });
          
          map.current?.flyTo({
            center: [longitude, latitude],
            zoom: 14,
            duration: 1500,
            essential: true
          });
        },
        (error) => {
          console.error('Location error:', error);
          toast({
            title: "Location unavailable",
            description: "Turn on location services to use this feature",
            variant: "destructive"
          });
        }
      );
    } else {
      toast({
        title: "Location unavailable",
        description: "Your device doesn't support location services",
        variant: "destructive"
      });
    }
  };


  // Handle venue selection from search
  const handleVenueSearchSelect = (venue: Venue) => {
    if (map.current) {
      map.current.flyTo({
        center: [venue.lng, venue.lat],
        zoom: 16,
        duration: 1500,
      });
    }
    openVenueCard(venue.id);
    setShowSearchOverlay(false);
    setSearchQuery('');
  };

  // Handle friend selection from search
  const handleFriendSearchSelect = (friend: FriendLocation) => {
    if (map.current) {
      map.current.flyTo({
        center: [friend.lng, friend.lat],
        zoom: 15,
        duration: 1500,
      });
    }
    const friendCardData: FriendCardData = {
      userId: friend.user_id,
      displayName: friend.profiles?.display_name || 'Friend',
      avatarUrl: friend.profiles?.avatar_url || null,
      venueName: friend.venue_name,
      lat: friend.lat,
      lng: friend.lng,
      relationshipType: friend.relationshipType,
    };
    openFriendCard(friendCardData);
    setShowSearchOverlay(false);
    setSearchQuery('');
  };

  // Trending venues (top 3 by heat score)
  const trendingVenues = venues.slice(0, 3);

  // Venue type emoji helper
  const venueTypeIcon = (type: string) => {
    if (type === 'nightclub') return <Music className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'cocktail_bar') return <Wine className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'bar') return <Beer className="h-4 w-4 text-[#a855f7]" />;
    if (type === 'rooftop') return <Building className="h-4 w-4 text-[#a855f7]" />;
    return <MapPin className="h-4 w-4 text-[#d4ff00]" />;
  };

  // Filtered search results
  const searchPeopleResults = searchFilterPeople && searchQuery.length > 0
    ? friends.filter(f => f.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];
  const searchVenueResults = searchFilterVenues && searchQuery.length > 0
    ? venues.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()) || v.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)
    : [];

  // Consistent bottom offset for all floating elements (nav height + padding + safe area)
  const bottomOffset = 'calc(5rem + env(safe-area-inset-bottom, 0px))';
  const legendBottomOffset = 'calc(9rem + env(safe-area-inset-bottom, 0px))';

  return (
    <div className="relative flex-1 w-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Header */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-between px-6 py-4 z-20"
        style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
          <CityBadge />
        </div>
        <div className="flex items-center gap-4">
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
            <img src={spottedLogo} alt="Go live" className="h-10 w-10 object-contain" />
          </button>
        </div>
      </div>

      {/* Unified Search Bar */}
      <div 
        className={`absolute left-4 z-[200] flex items-center gap-2 transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ top: 'calc(5.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <button
          onClick={() => setShowSearchOverlay(true)}
          className="max-w-[260px] h-10 bg-black/50 backdrop-blur-md border border-white/15 rounded-full px-3 py-2 flex items-center gap-2 hover:bg-black/60 transition-all"
        >
          <Search className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
          <span className="text-white/50 text-xs flex-1 text-left truncate">Search people, venues...</span>
        </button>
        <button
          onClick={() => setShowFilterSheet(true)}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center hover:bg-black/60 transition-colors flex-shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4 text-white/70" />
        </button>
      </div>

      {/* Smart Venue Prompt Banner (planning users near a venue) */}
      {showSmartPrompt && smartPromptVenue && !focusMode && (
        <div
          className="absolute left-4 right-4 z-[201] animate-fade-in"
          style={{ top: 'calc(8.5rem + env(safe-area-inset-top, 0px))' }}
        >
          <div className="bg-gradient-to-r from-[#d4ff00]/20 to-[#a855f7]/20 backdrop-blur border border-[#d4ff00]/40 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-white text-sm font-medium">
                Looks like you're at <span className="text-[#d4ff00]">{smartPromptVenue.name}</span>
              </p>
              <p className="text-white/50 text-xs">Go live?</p>
            </div>
            <button
              onClick={() => {
                setShowSmartPrompt(false);
                setShowQuickStatus(true);
              }}
              className="px-3 py-1.5 bg-[#d4ff00] text-[#0a0118] text-xs font-semibold rounded-full hover:bg-[#d4ff00]/90 transition-colors"
            >
              Share Location
            </button>
            <button
              onClick={() => {
                setShowSmartPrompt(false);
                smartPromptDismissedRef.current.add(smartPromptVenue.id);
              }}
              className="text-white/40 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Banners area (venue move + planning ready) */}
      {!focusMode && (showVenueMoveBanner || showPlanningReady) && (
        <div
          className="absolute left-4 right-4 z-[202] space-y-2"
          style={{ top: showSmartPrompt && smartPromptVenue ? 'calc(12rem + env(safe-area-inset-top, 0px))' : 'calc(8.5rem + env(safe-area-inset-top, 0px))' }}
        >
          {showVenueMoveBanner && venueShiftData && (
            <VenueMoveBanner
              venue={venueShiftData.venue}
              hasMultipleNearby={venueShiftData.hasMultipleNearby}
              onAccept={async () => {
                if (!user) return;
                setShowVenueMoveBanner(false);
                const now = new Date().toISOString();
                // Instant one-tap update
                await supabase.from('checkins').update({ ended_at: now }).eq('user_id', user.id).is('ended_at', null);
                await supabase.from('checkins').insert({
                  user_id: user.id,
                  venue_id: venueShiftData.venue.id,
                  venue_name: venueShiftData.venue.name,
                  lat: venueShiftData.lat,
                  lng: venueShiftData.lng,
                  started_at: now,
                });
                await supabase.from('night_statuses').update({
                  venue_id: venueShiftData.venue.id,
                  venue_name: venueShiftData.venue.name,
                  lat: venueShiftData.lat,
                  lng: venueShiftData.lng,
                  updated_at: now,
                }).eq('user_id', user.id);
                await supabase.from('profiles').update({
                  last_known_lat: venueShiftData.lat,
                  last_known_lng: venueShiftData.lng,
                  last_location_at: now,
                }).eq('id', user.id);
                toast({ title: `📍 Now at ${venueShiftData.venue.name}` });
                fetchFriendsLocations();
              }}
              onDismiss={() => {
                setShowVenueMoveBanner(false);
                venueMoveDismissedRef.current = true;
              }}
              onSomewhereElse={() => {
                setShowVenueMoveBanner(false);
                setShowUpdateSpot(true);
              }}
            />
          )}
          {showPlanningReady && currentUserStatus === 'planning' && (
            <PlanningReadyBanner
              onGoOut={() => {
                setShowPlanningReady(false);
                openCheckIn();
              }}
              onDismiss={() => setShowPlanningReady(false)}
            />
          )}
        </div>
      )}

      {/* Status Pill + Stop Sharing */}
      {currentUserStatus && !focusMode && (
        <div
          className="absolute left-4 z-[199] flex items-center gap-2 transition-opacity duration-300"
          style={{ top: (() => {
            let base = 8.5;
            if (showSmartPrompt && smartPromptVenue) base = 12;
            if (showVenueMoveBanner || showPlanningReady) base += 3.5;
            return `calc(${base}rem + env(safe-area-inset-top, 0px))`;
          })() }}
        >
          <button
            onClick={() => currentUserStatus === 'out' ? setShowUpdateSpot(true) : setShowQuickStatus(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full backdrop-blur-md border transition-all hover:scale-105 bg-black/40 border-white/10 ${
              currentUserStatus === 'out'
                ? 'text-[#d4ff00]'
                : currentUserStatus === 'planning'
                ? 'text-[#a855f7]'
                : 'text-white/50'
            }`}
          >
            {currentUserStatus === 'out' ? (
              <>
                <MapPin className="w-3 h-3 fill-current" />
                <span className="text-[11px] font-medium">Out{currentUserVenue ? ` · ${currentUserVenue}` : ''}</span>
              </>
            ) : currentUserStatus === 'planning' ? (
              <>
                <Target className="w-3 h-3" />
                <span className="text-[11px] font-medium">Planning</span>
              </>
            ) : (
              <>
                <Home className="w-3 h-3" />
                <span className="text-[11px] font-medium">In</span>
              </>
            )}
          </button>

          {/* Stop Sharing button — visible when actively out */}
          {currentUserStatus === 'out' && (
            <button
              onClick={async () => {
                if (!user) return;
                const now = new Date().toISOString();
                const expiry = new Date();
                if (expiry.getHours() < 5) { expiry.setHours(5, 0, 0, 0); } else { expiry.setDate(expiry.getDate() + 1); expiry.setHours(5, 0, 0, 0); }

                await supabase.from('night_statuses').upsert({
                  user_id: user.id, status: 'off', venue_id: null, venue_name: null,
                  lat: null, lng: null, updated_at: now, expires_at: expiry.toISOString(),
                  is_private_party: false, planning_neighborhood: null,
                }, { onConflict: 'user_id' });

                await supabase.from('checkins').update({ ended_at: now }).eq('user_id', user.id).is('ended_at', null);

                await supabase.from('profiles').update({
                  is_out: false, last_known_lat: null, last_known_lng: null, last_location_at: null,
                }).eq('id', user.id);

                setCurrentUserStatus('off');
                setCurrentUserVenue(null);
                toast({ title: 'Location sharing stopped', description: 'Your friends can no longer see you.' });
                fetchFriendsLocations();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md border border-white/10 bg-black/40 text-red-400 hover:bg-black/50 transition-all text-[11px] font-medium"
            >
              <MapPinOff className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      )}

      {/* Quick Status Sheet (for non-out statuses) */}
      <QuickStatusSheet
        open={showQuickStatus}
        onOpenChange={(open) => {
          setShowQuickStatus(open);
          if (!open) fetchFriendsLocations();
        }}
        suggestedVenue={showSmartPrompt ? smartPromptVenue : null}
      />

      {/* Update Spot Sheet (for out status — venue switching) */}
      <UpdateSpotSheet
        open={showUpdateSpot}
        onOpenChange={(open) => {
          setShowUpdateSpot(open);
          if (!open) fetchFriendsLocations();
        }}
        onUpdated={fetchFriendsLocations}
      />

      {/* Full-Screen Search Overlay */}
      {showSearchOverlay && (
        <div className="fixed inset-0 bg-[#0a0118] z-[500] flex flex-col animate-fade-in pointer-events-auto" style={{ touchAction: 'auto' }}>
          {/* Search Header */}
          <div className="flex items-center gap-3 px-4 py-4" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}>
            <button 
              onClick={() => { setShowSearchOverlay(false); setSearchQuery(''); }}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1 bg-[#2d1b4e]/80 border border-[#a855f7]/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <Search className="w-4 h-4 text-white/40" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search people, venues, or neighborhoods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white text-sm flex-1 outline-none placeholder:text-white/40"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X className="w-4 h-4 text-white/40 hover:text-white transition-colors" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex gap-2 px-4 pb-3">
            <button
              onClick={(e) => { e.stopPropagation(); setSearchFilterPeople(!searchFilterPeople); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                searchFilterPeople 
                  ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50' 
                  : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              People
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSearchFilterVenues(!searchFilterVenues); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                searchFilterVenues 
                  ? 'bg-[#a855f7]/30 text-white border border-[#a855f7]/50' 
                  : 'bg-[#2d1b4e]/50 text-white/50 border border-white/10'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Venues
            </button>
          </div>

          {/* Search Content */}
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {searchQuery.length === 0 ? (
              <>
                {/* Trending Tonight */}
                {searchFilterVenues && trendingVenues.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">🔥 Trending Tonight</h3>
                    <div className="space-y-1">
                      {trendingVenues.map((venue) => (
                        <button
                          key={venue.id}
                          onClick={() => handleVenueSearchSelect(venue)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <span className="flex items-center">{venueTypeIcon(venue.type)}</span>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{venue.name}</p>
                            <p className="text-white/40 text-xs">{venue.neighborhood}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Friends Out Now */}
                {searchFilterPeople && friends.length > 0 && (
                  <div>
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">👥 Friends Out Now</h3>
                    <div className="space-y-1">
                      {friends.map((friend) => (
                        <button
                          key={friend.user_id}
                          onClick={() => handleFriendSearchSelect(friend)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
                            <AvatarImage src={friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`} />
                            <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                              {friend.profiles?.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{friend.profiles?.display_name}</p>
                            <p className="text-[#d4ff00] text-xs">📍 {friend.venue_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* People Results */}
                {searchFilterPeople && searchPeopleResults.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">People</h3>
                    <div className="space-y-1">
                      {searchPeopleResults.map((friend) => (
                        <button
                          key={friend.user_id}
                          onClick={() => handleFriendSearchSelect(friend)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <Avatar className="w-9 h-9 border-2 border-[#a855f7]/40">
                            <AvatarImage src={friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`} />
                            <AvatarFallback className="bg-[#a855f7]/20 text-white text-xs">
                              {friend.profiles?.display_name?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{friend.profiles?.display_name}</p>
                            <p className="text-[#d4ff00] text-xs">📍 {friend.venue_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Venue Results */}
                {searchFilterVenues && searchVenueResults.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">Venues</h3>
                    <div className="space-y-1">
                      {searchVenueResults.map((venue) => (
                        <button
                          key={venue.id}
                          onClick={() => handleVenueSearchSelect(venue)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors"
                        >
                          <span className="flex items-center">{venueTypeIcon(venue.type)}</span>
                          <div className="flex-1 text-left">
                            <p className="text-white font-medium text-sm">{venue.name}</p>
                            <p className="text-white/40 text-xs">{venue.neighborhood}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results */}
                {searchPeopleResults.length === 0 && searchVenueResults.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-white/40 text-sm">No results found</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick Filter Bottom Sheet */}
      <Drawer open={showFilterSheet} onOpenChange={setShowFilterSheet}>
        <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
          <DrawerHeader>
            <DrawerTitle className="text-white">Show on Map</DrawerTitle>
          </DrawerHeader>
          <div className="px-6 pb-6 space-y-6">
            {/* Relationship Filter */}
            <div className="space-y-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">People</p>
              <RadioGroup 
                value={relationshipFilter} 
                onValueChange={(val) => {
                  setRelationshipFilter(val as 'all' | 'close' | 'friends_only');
                  if (val === 'friends_only') {
                    setLayerVisibility('friends');
                  } else {
                    setLayerVisibility('both');
                  }
                  setShowFilterSheet(false);
                }}
                className="space-y-2"
              >
                {[
                  { value: 'all', label: 'Everyone', desc: 'Show all friends & venues' },
                  { value: 'close', label: 'Close Friends Only', desc: 'Only close friends, still show venues' },
                  { value: 'friends_only', label: 'Friends Only', desc: 'Hide venue pins' },
                ].map((opt) => (
                  <Label
                    key={opt.value}
                    htmlFor={`filter-${opt.value}`}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      relationshipFilter === opt.value 
                        ? 'bg-[#a855f7]/20 border border-[#a855f7]/40' 
                        : 'bg-[#2d1b4e]/50 border border-transparent hover:bg-[#2d1b4e]/80'
                    }`}
                  >
                    <RadioGroupItem value={opt.value} id={`filter-${opt.value}`} className="border-[#a855f7] text-[#a855f7]" />
                    <div>
                      <p className="text-white text-sm font-medium">{opt.label}</p>
                      <p className="text-white/40 text-xs">{opt.desc}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Venue Type Filter */}
            <div className="space-y-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Venue Type</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'all', label: 'All Venues', icon: <MapIcon className="h-4 w-4" /> },
                  { key: 'nightclub', label: 'Clubs', icon: <Music className="h-4 w-4" /> },
                  { key: 'cocktail_bar', label: 'Cocktails', icon: <Wine className="h-4 w-4" /> },
                  { key: 'bar', label: 'Bars', icon: <Beer className="h-4 w-4" /> },
                  { key: 'rooftop', label: 'Rooftops', icon: <Building className="h-4 w-4" /> },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => {
                      setVenueFilter(filter.key as typeof venueFilter);
                      setShowFilterSheet(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      venueFilter === filter.key
                        ? 'bg-[#a855f7]/25 text-[#d4ff00] font-semibold border border-[#a855f7]/40'
                        : 'bg-[#2d1b4e]/50 text-white/70 border border-transparent hover:bg-[#2d1b4e]/80'
                    }`}
                  >
                    <span>{filter.icon}</span>
                    <span>{filter.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Friends Out Pill + List - Bottom Left - Hidden in venues-only mode */}
      {layerVisibility !== 'venues' && friends.length > 0 ? (
        <div ref={friendsListRef} className={`absolute left-6 z-[200] max-w-sm transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: bottomOffset }}>
          {/* Expanded Friends List - Opens Upward */}
          {showFriendsList && (
            <div className="mb-2 bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg shadow-[0_0_30px_rgba(168,85,247,0.4)] max-h-96 overflow-y-auto relative z-[200]">
              {/* Friends Out Section */}
              {friendsWithDistances.map((friend) => (
                <button
                  key={friend.user_id}
                  onClick={() => handleFriendClick(friend)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10"
                >
                  {/* Avatar */}
                  <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50 relative">
                    <AvatarImage
                      src={
                        friend.profiles?.avatar_url ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`
                      }
                    />
                    <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                      {friend.profiles?.display_name?.[0] || '?'}
                    </AvatarFallback>
                    {friend.relationshipType === 'close' && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1a0f2e] border-2 border-[#d4ff00] rounded-full flex items-center justify-center text-xs">
                        💛
                      </div>
                    )}
                    {friend.relationshipType === 'mutual' && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#1a0f2e] border-2 border-[#6366f1] rounded-full flex items-center justify-center text-xs">
                        🔗
                      </div>
                    )}
                  </Avatar>

                  {/* Name & Venue */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white font-semibold text-sm truncate">
                      {friend.profiles?.display_name || 'Unknown'}
                    </p>
                    <p className="text-[#d4ff00] text-xs truncate">
                      📍 At {friend.venue_name || 'Nearby'}
                    </p>
                  </div>

                  {/* Distance */}
                  <span className="text-white/60 text-xs flex-shrink-0">
                    {friend.distance} mi
                  </span>
                </button>
              ))}

              {/* Friends Planning Section */}
              {planningFriends.length > 0 && (
                <>
                  {/* Divider with header */}
                  <div className="px-3 py-2 bg-[#1a0f2e]/50 border-y border-[#a855f7]/20">
                    <p className="text-white/70 text-xs font-medium flex items-center gap-1.5">
                      🔥 Friends Planning 🎯
                      <span className="text-white/50">({planningFriends.length})</span>
                    </p>
                  </div>

                  {/* Planning Friends List */}
                  {planningFriends.map((friend) => (
                    <button
                      key={friend.user_id}
                      onClick={() => {
                        const friendCardData: FriendCardData = {
                          userId: friend.user_id,
                          displayName: friend.display_name || 'Friend',
                          avatarUrl: friend.avatar_url || null,
                          venueName: null,
                          lat: undefined,
                          lng: undefined,
                          relationshipType: undefined,
                        };
                        openFriendCard(friendCardData);
                        setShowFriendsList(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10 last:border-b-0"
                    >
                      {/* Avatar */}
                      <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-[#a855f7]/50">
                        <AvatarImage
                          src={
                            friend.avatar_url ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`
                          }
                        />
                        <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                          {friend.display_name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name & Planning Status */}
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-white font-semibold text-sm truncate">
                          {friend.display_name || 'Unknown'}
                        </p>
                        <p className="text-[#a855f7] text-xs truncate">
                          🎯 Planning{friend.planning_neighborhood ? ` (${friend.planning_neighborhood})` : ' tonight'}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Clickable Pill */}
          <button
            onClick={toggleFriendsList}
            className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 hover:bg-[#2d1b4e] transition-colors w-full"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#a855f7] rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></div>
              <span className="text-white/80 text-sm">{friends.length} friends out</span>
              <ChevronDown className={`w-4 h-4 text-white/60 transition-transform duration-200 ${showFriendsList ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </div>
      ) : layerVisibility !== 'venues' && !demoEnabled ? (
        <div className={`absolute left-6 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-20 transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: bottomOffset }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#a855f7]/30 rounded-full"></div>
            <span className="text-white/60 text-sm">No friends out</span>
          </div>
        </div>
      ) : null}


      {/* My Location Button */}
      <button
        onClick={centerOnMyLocation}
        className={`absolute right-6 w-12 h-12 rounded-full bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/50 flex items-center justify-center z-20 hover:bg-[#2d1b4e] transition-all duration-300 shadow-[0_0_20px_rgba(168,85,247,0.4)] ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ bottom: bottomOffset }}
        aria-label="Center on my location"
      >
        <Crosshair className="w-5 h-5 text-white" />
      </button>

      {/* Legend - Hidden in venues-only mode */}
      {layerVisibility !== 'venues' && (
        <div className={`absolute right-6 bg-[#2d1b4e]/95 backdrop-blur-sm border border-[#a855f7]/20 rounded-md p-2 z-20 shadow-[0_0_8px_rgba(168,85,247,0.2)] transition-opacity duration-300 ${focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ bottom: legendBottomOffset }}>
        <p className="text-white/70 text-[10px] font-medium mb-1.5">Relationship</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-[#d4ff00] flex items-center justify-center text-[6px] bg-[#1a0f2e] shadow-[0_0_4px_rgba(212,255,0,0.3)]">
              💛
            </div>
            <span className="text-white/60 text-[10px]">Close</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-[#a855f7] bg-[#1a0f2e] shadow-[0_0_4px_rgba(168,85,247,0.3)]"></div>
            <span className="text-white/60 text-[10px]">Friend</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-[1.5px] border-[#6366f1] flex items-center justify-center text-[6px] bg-[#1a0f2e] shadow-[0_0_4px_rgba(99,102,241,0.3)]">
              🔗
            </div>
            <span className="text-white/60 text-[10px]">Mutual</span>
          </div>
        </div>
        </div>
      )}

      {/* Cluster Friends Popover */}
      {selectedCluster && (
        <div 
          className="absolute z-[300] bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/40 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.4)] overflow-hidden animate-fade-in"
          style={{
            left: Math.min(
              Math.max(selectedCluster.screenX - 120, 10),
              window.innerWidth - 260
            ),
            top: selectedCluster.screenY + 300 > window.innerHeight 
              ? Math.max(selectedCluster.screenY - 280, 80)
              : selectedCluster.screenY + 40,
            minWidth: '240px',
            maxWidth: '280px',
            maxHeight: 'calc(100vh - 160px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-[#a855f7]/20">
            <h3 className="text-white font-medium text-sm">
              Friends at {selectedCluster.venueName}
            </h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {selectedCluster.friends.map((friend) => (
              <button
                key={friend.user_id}
                onClick={() => {
                  setSelectedCluster(null);
                  const friendCardData: FriendCardData = {
                    userId: friend.user_id,
                    displayName: friend.profiles?.display_name || 'Friend',
                    avatarUrl: friend.profiles?.avatar_url || null,
                    venueName: friend.venue_name,
                    lat: friend.lat,
                    lng: friend.lng,
                    relationshipType: friend.relationshipType,
                  };
                  openFriendCard(friendCardData);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#a855f7]/10 transition-colors"
              >
                <Avatar className="h-10 w-10 border-2 border-[#a855f7]/50">
                  <AvatarImage 
                    src={friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`} 
                    alt={friend.profiles?.display_name} 
                  />
                  <AvatarFallback className="bg-[#a855f7]/20 text-white">
                    {friend.profiles?.display_name?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white font-medium text-sm flex-1 text-left">
                  {friend.profiles?.display_name}
                </span>
                <ChevronDown className="w-4 h-4 text-white/40 -rotate-90" />
              </button>
            ))}
          </div>
        </div>
      )}

      <FriendSearchModal open={showFriendSearch} onOpenChange={setShowFriendSearch} />
    </div>
  );
}
