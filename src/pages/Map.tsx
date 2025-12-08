import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard, FriendCardData } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
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
import { MessageSquare, Crosshair, MapPin, Bell, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useToast } from '@/hooks/use-toast';
import { CityBadge } from '@/components/CityBadge';
import { logger } from '@/lib/logger';

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
}

export default function Map() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const { openFriendCard } = useFriendIdCard();
  const { openVenueCard } = useVenueIdCard();
  const demoEnabled = useDemoMode();
  const { city } = useUserCity();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  useAutoVenueTracking(); // Trigger auto-venue tracking on map view
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueFilter, setVenueFilter] = useState<'all' | 'nightclub' | 'cocktail_bar' | 'bar' | 'rooftop'>('all');
  // Use Map object keyed by user_id to prevent duplicate markers
  const friendMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const venueMarkersRef = useRef<globalThis.Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const [showVenueFilters, setShowVenueFilters] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const friendsListRef = useRef<HTMLDivElement>(null);
  const venueFilterRef = useRef<HTMLDivElement>(null);
  
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
        .select('is_out, last_known_lat, last_known_lng, location_sharing_level')
        .eq('id', user.id)
        .single();

      // Update user's location state
      if (myProfile?.is_out && myProfile.last_known_lat && myProfile.last_known_lng) {
        console.log('Setting user location:', { lat: myProfile.last_known_lat, lng: myProfile.last_known_lng, is_out: myProfile.is_out });
        setUserLocation({ lat: myProfile.last_known_lat, lng: myProfile.last_known_lng });
      } else {
        console.log('User location not set - is_out:', myProfile?.is_out, 'has coords:', !!myProfile?.last_known_lat);
        setUserLocation(null);
      }

      let friendLocations: FriendLocation[] = [];
      let friendIds: string[] = [];

      // When demo mode is ON, fetch demo users from database
      if (demoEnabledRef.current) {
        // Fetch demo users who are "out" from night_statuses joined with profiles
        const { data: demoStatuses } = await supabase
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
          .gt('expires_at', new Date().toISOString());

        // Fetch venues for current city to filter demo users
        const { data: cityVenues } = await supabase
          .from('venues')
          .select('name')
          .eq('city', cityRef.current);

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
      } else {
        // Normal mode: show real friends only
        // Get list of accepted friends (both directions)
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

        if (friendIds.length > 0) {
          // Get friends' profiles with location data via safe RPC function
          // This function properly masks location data based on can_see_location permissions
          const { data: allProfiles } = await supabase.rpc('get_profiles_safe');
          
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

          // Get friends' venue names from night_statuses
          const { data: statuses } = await supabase
            .from('night_statuses')
            .select('user_id, venue_name')
            .in('user_id', friendIds)
            .not('expires_at', 'is', null)
            .gt('expires_at', new Date().toISOString());

          const venueMap: Record<string, string> = {};
          statuses?.forEach(s => {
            venueMap[s.user_id] = s.venue_name;
          });

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
          friendLocations = (friendProfiles || []).map((friend: any) => ({
            user_id: friend.id,
            lat: friend.last_known_lat,
            lng: friend.last_known_lng,
            venue_name: venueMap[friend.id] || 'Out',
            profiles: {
              display_name: friend.display_name || 'Unknown',
              avatar_url: friend.avatar_url,
            },
            relationshipType: relationshipTypes[friend.id] || 'direct',
          }));
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
      // Fetch all venues (single query)
      const { data: venuesData } = await supabase
        .from('venues')
        .select('*');

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
        };
      });

      // Filter venues by city (not radius) to show all venues in the user's city
      const filteredVenues = venuesWithHeat.filter((venue) => venue.city === cityRef.current);

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
      // Auto-collapse expanded clusters when zooming out
      if (zoom < 18) {
        setExpandedClusters(new Set());
      }
    });

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

    // Create user marker with distinct styling (yellow glow)
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.style.width = '70px';
    el.style.height = '70px';
    el.style.cursor = 'pointer';
    
    el.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <div style="position: absolute; inset: 0; border-radius: 50%; border: 3px solid #d4ff00; box-shadow: 0 0 12px rgba(212, 255, 0, 0.4);"></div>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; background: #d4ff00; border-radius: 50%; box-shadow: 0 0 6px rgba(212, 255, 0, 0.6);"></div>
      </div>
    `;

    userMarkerRef.current = new mapboxgl.Marker({ 
      element: el, 
      anchor: 'center' 
    })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [userLocation]);

  // Smart marker diffing with clustering for groups
  // ~5 meters = 0.000045 degrees (venue-level accuracy)
  const CLUSTER_THRESHOLD = 0.000045;
  const SPREAD_RADIUS = 0.0002; // ~20m spread when expanded

  useEffect(() => {
    if (!map.current || isLoadingFriends) return;

    // Clear all markers first for clean re-render
    friendMarkersRef.current.forEach(marker => marker.remove());
    friendMarkersRef.current.clear();

    // At high zoom (18+), don't cluster - show all individual avatars
    const shouldCluster = currentZoom < 18;

    // Group friends by location (within 5m threshold)
    const clusters: FriendLocation[][] = [];
    const assigned = new Set<string>();

    friends.forEach((friend) => {
      if (assigned.has(friend.user_id)) return;
      
      const cluster = [friend];
      assigned.add(friend.user_id);
      
      if (shouldCluster) {
        friends.forEach((other) => {
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

    // Helper to create individual avatar marker
    const createAvatarMarker = (friend: FriendLocation, lng: number, lat: number) => {
      const el = document.createElement('div');
      el.className = 'friend-marker';
      el.style.width = '52px';
      el.style.height = '52px';
      el.style.cursor = 'pointer';
      el.style.zIndex = '50'; // High z-index to stay above venue markers
      
      const ringColors = {
        close: { border: '#d4ff00', shadow: 'rgba(212, 255, 0, 0.35)', badge: '💛' },
        direct: { border: '#a855f7', shadow: 'rgba(168, 85, 247, 0.35)', badge: '' },
        mutual: { border: '#6366f1', shadow: 'rgba(99, 102, 241, 0.35)', badge: '🔗' },
      };
      
      const colors = ringColors[friend.relationshipType || 'direct'];
      
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;">
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 2px solid ${colors.border}; box-shadow: 0 0 8px ${colors.shadow};"></div>
          <img 
            src="${friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`}" 
            style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; padding: 3px;"
            alt="${friend.profiles?.display_name}"
          />
          ${colors.badge ? `
            <div style="position: absolute; bottom: -2px; right: -2px; width: 16px; height: 16px; background: #1a0f2e; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid ${colors.border}; font-size: 9px;">
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

    // Render clusters
    clusters.forEach((cluster) => {
      const clusterKey = `cluster-${cluster.map(f => f.user_id).sort().join('-')}`;
      const isExpanded = expandedClusters.has(clusterKey);
      const centerLat = cluster[0].lat;
      const centerLng = cluster[0].lng;

      if (cluster.length >= 4 && shouldCluster && !isExpanded) {
        // Create cluster bubble for 4+ friends (not expanded)
        const el = document.createElement('div');
        el.className = 'cluster-marker';
        el.style.width = '70px';
        el.style.height = '70px';
        el.style.cursor = 'pointer';
        el.style.zIndex = '55'; // Above individual friend avatars
        
        const displayFriends = cluster.slice(0, 3);
        const remainingCount = cluster.length - 3;
        
        el.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%;">
            <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(45, 27, 78, 0.95); border: 2px solid rgba(168, 85, 247, 0.5); box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);"></div>
            <img src="${displayFriends[0]?.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayFriends[0]?.profiles?.display_name}`}" 
                 style="position: absolute; top: 6px; left: 50%; transform: translateX(-50%); width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1.5px solid #a855f7;" />
            <img src="${displayFriends[1]?.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayFriends[1]?.profiles?.display_name}`}" 
                 style="position: absolute; bottom: 14px; left: 10px; width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1.5px solid #a855f7;" />
            <img src="${displayFriends[2]?.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayFriends[2]?.profiles?.display_name}`}" 
                 style="position: absolute; bottom: 14px; right: 10px; width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 1.5px solid #a855f7;" />
            <div style="position: absolute; bottom: -4px; right: -4px; min-width: 22px; height: 22px; background: #a855f7; border-radius: 11px; display: flex; align-items: center; justify-content: center; padding: 0 6px; font-size: 11px; font-weight: 600; color: white; border: 2px solid #1a0f2e;">
              +${remainingCount}
            </div>
          </div>
        `;

        el.addEventListener('click', () => {
          // Tap to expand cluster
          setExpandedClusters(prev => new Set([...prev, clusterKey]));
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([centerLng, centerLat])
          .addTo(map.current!);

        friendMarkersRef.current.set(clusterKey, marker);
      } else if (cluster.length >= 4 && isExpanded) {
        // Expanded cluster - spread avatars in a circle
        cluster.forEach((friend, idx) => {
          const angleStep = (2 * Math.PI) / cluster.length;
          const angle = idx * angleStep;
          const spreadLng = centerLng + SPREAD_RADIUS * Math.cos(angle);
          const spreadLat = centerLat + SPREAD_RADIUS * Math.sin(angle);
          createAvatarMarker(friend, spreadLng, spreadLat);
        });
        
        // Add a collapse button in center
        const collapseEl = document.createElement('div');
        collapseEl.style.width = '32px';
        collapseEl.style.height = '32px';
        collapseEl.style.cursor = 'pointer';
        collapseEl.style.zIndex = '30';
        collapseEl.innerHTML = `
          <div style="width: 100%; height: 100%; background: rgba(45, 27, 78, 0.95); border: 2px solid rgba(168, 85, 247, 0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(168, 85, 247, 0.3);">
            <span style="color: white; font-size: 14px; font-weight: 600;">−</span>
          </div>
        `;
        collapseEl.addEventListener('click', () => {
          setExpandedClusters(prev => {
            const next = new Set(prev);
            next.delete(clusterKey);
            return next;
          });
        });
        
        const collapseMarker = new mapboxgl.Marker({ element: collapseEl, anchor: 'center' })
          .setLngLat([centerLng, centerLat])
          .addTo(map.current!);
        
        friendMarkersRef.current.set(`${clusterKey}-collapse`, collapseMarker);
      } else {
        // 1-3 friends or high zoom - render individually with slight offset
        cluster.forEach((friend, idx) => {
          const offset = cluster.length > 1 ? (idx - (cluster.length - 1) / 2) * 0.00015 : 0;
          const adjustedLng = friend.lng + offset;
          createAvatarMarker(friend, adjustedLng, friend.lat);
        });
      }
    });
  }, [friends, isLoadingFriends, currentZoom, expandedClusters]);

  // Determine how many venues to show based on zoom level
  const getVisibleVenueCount = (zoom: number): number => {
    if (zoom < 11) return 5;         // City overview: Top 5 hottest venues
    if (zoom < 12) return 15;        // Wide view: Top 15 venues
    if (zoom < 13) return 30;        // Neighborhood view: Top 30 venues
    if (zoom < 14) return 60;        // Closer: Top 60 venues
    if (zoom < 15) return 100;       // Close: Top 100 venues
    return Infinity;                  // All venues at zoom 15+
  };

  // Filter venues based on selected filter and zoom level
  const typeFilteredVenues = venueFilter === 'all' 
    ? venues 
    : venues.filter(v => v.type === venueFilter);
  
  const visibleCount = getVisibleVenueCount(currentZoom);
  const filteredVenues = typeFilteredVenues.slice(0, visibleCount);

  // Render venue markers with smart diffing (like friend avatars)
  useEffect(() => {
    if (!map.current) return;

    // Get current venue IDs from the filtered venues array
    const currentVenueIds = new Set(filteredVenues.map(v => v.id));

    // Remove markers for venues no longer in the filtered list
    venueMarkersRef.current.forEach((marker, venueId) => {
      if (!currentVenueIds.has(venueId)) {
        marker.remove();
        venueMarkersRef.current.delete(venueId);
      }
    });

    // Add or update markers for current filtered venues
    filteredVenues.forEach((venue, index) => {
      const existingMarker = venueMarkersRef.current.get(venue.id);

      if (existingMarker) {
        // Update existing marker position only (no recreation)
        existingMarker.setLngLat([venue.lng, venue.lat]);
      } else {
        // Create new marker only if doesn't exist
        const isTopHot = index < 3 && venue.heatScore > 0;
        // Balanced pin sizes - visible but smaller than friends
        const containerSize = 50;
        const pinSize = 38;
        const opacity = venue.heatScore > 0 ? 1 : 0.5;

        const el = document.createElement('div');
        el.className = 'venue-marker';
        el.style.width = `${containerSize}px`;
        el.style.height = `${containerSize}px`;
        el.style.cursor = 'pointer';
        el.style.zIndex = '15'; // Below friend avatars (z-index 50) but visible
        
        el.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            ${isTopHot ? `<div style="position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%); animation: pulse 2s infinite;"></div>` : ''}
            <div style="width: ${pinSize}px; height: ${pinSize}px; background: #a855f7; border-radius: 50%; opacity: ${opacity}; box-shadow: 0 0 ${isTopHot ? '6px' : '3px'} rgba(168, 85, 247, ${isTopHot ? '0.5' : '0.3'}); display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(255, 255, 255, 0.8);">
              <svg width="${pinSize * 0.5}" height="${pinSize * 0.5}" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </div>
        `;

        el.addEventListener('click', () => {
          openVenueCard(venue.id);
        });

        const marker = new mapboxgl.Marker({ 
          element: el, 
          anchor: 'center' 
        })
          .setLngLat([venue.lng, venue.lat])
          .addTo(map.current!);

        venueMarkersRef.current.set(venue.id, marker);
      }
    });
  }, [filteredVenues, friends]);

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
      if (
        venueFilterRef.current &&
        !venueFilterRef.current.contains(event.target as Node) &&
        showVenueFilters
      ) {
        setShowVenueFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFriendsList, showVenueFilters]);

  const centerOnMyLocation = () => {
    if (!map.current) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
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

  return (
    <div className="relative h-screen w-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-6 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
          <CityBadge />
        </div>
        <div className="flex items-center gap-3">
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

      {/* Venue Type Filter - Collapsible in top right */}
      <div ref={venueFilterRef} className="absolute top-20 right-4 z-20">
        {/* Collapsed Pill */}
        <button
          onClick={() => setShowVenueFilters(!showVenueFilters)}
          className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-full px-3 py-2 hover:bg-[#2d1b4e] hover:border-[#a855f7]/50 transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)]"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {venueFilter === 'all' ? '🗺️' : 
               venueFilter === 'nightclub' ? '🎵' :
               venueFilter === 'cocktail_bar' ? '🍸' :
               venueFilter === 'bar' ? '🍺' : '🌃'}
            </span>
            <span className="text-white/90 text-sm font-medium">
              {venueFilter === 'all' ? 'All Venues' :
               venueFilter === 'nightclub' ? 'Clubs' :
               venueFilter === 'cocktail_bar' ? 'Cocktails' :
               venueFilter === 'bar' ? 'Bars' : 'Rooftops'}
            </span>
            <ChevronDown className={`w-4 h-4 text-white/60 transition-transform duration-200 ${showVenueFilters ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Expanded Filter Options */}
        {showVenueFilters && (
          <div className="mt-1.5 bg-[#1a0f2e] backdrop-blur border border-[#a855f7]/40 rounded-xl shadow-[0_0_25px_rgba(168,85,247,0.4)] overflow-hidden animate-fade-in min-w-[140px]">
            {[
              { key: 'all', label: 'All Venues', icon: '🗺️' },
              { key: 'nightclub', label: 'Clubs', icon: '🎵' },
              { key: 'cocktail_bar', label: 'Cocktails', icon: '🍸' },
              { key: 'bar', label: 'Bars', icon: '🍺' },
              { key: 'rooftop', label: 'Rooftops', icon: '🌃' },
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() => {
                  setVenueFilter(filter.key as typeof venueFilter);
                  setShowVenueFilters(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-all border-b border-[#a855f7]/10 last:border-b-0 ${
                  venueFilter === filter.key 
                    ? 'bg-[#a855f7]/25 shadow-[inset_0_0_10px_rgba(168,85,247,0.2)]' 
                    : 'hover:bg-[#a855f7]/15 hover:shadow-[inset_0_0_15px_rgba(168,85,247,0.1)]'
                }`}
              >
                <span className="text-sm">{filter.icon}</span>
                <span className={`text-sm ${venueFilter === filter.key ? 'text-[#d4ff00] font-semibold' : 'text-white/80'}`}>
                  {filter.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Friends Out Pill + List */}
      {friends.length > 0 ? (
        <div ref={friendsListRef} className="absolute top-20 left-4 z-20 max-w-sm">
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

          {/* Expanded Friends List */}
          {showFriendsList && (
            <div className="mt-2 bg-[#2d1b4e]/95 backdrop-blur border border-[#a855f7]/30 rounded-lg shadow-[0_0_30px_rgba(168,85,247,0.4)] max-h-96 overflow-y-auto">
              {friendsWithDistances.map((friend) => (
                <button
                  key={friend.user_id}
                  onClick={() => handleFriendClick(friend)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-[#a855f7]/20 transition-colors border-b border-[#a855f7]/10 last:border-b-0"
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
                      @ {friend.venue_name || 'Nearby'}
                    </p>
                  </div>

                  {/* Distance */}
                  <span className="text-white/60 text-xs flex-shrink-0">
                    {friend.distance} mi
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : !demoEnabled ? (
        <div className="absolute top-20 left-4 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-20">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#a855f7]/30 rounded-full"></div>
            <span className="text-white/60 text-sm">No friends out</span>
          </div>
        </div>
      ) : null}

      {/* My Location Button */}
      <button
        onClick={centerOnMyLocation}
        className="absolute bottom-24 right-6 w-12 h-12 rounded-full bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/50 flex items-center justify-center z-20 hover:bg-[#2d1b4e] transition-colors shadow-[0_0_20px_rgba(168,85,247,0.4)]"
        aria-label="Center on my location"
      >
        <Crosshair className="w-5 h-5 text-white" />
      </button>

      {/* Legend */}
      <div className="absolute bottom-40 right-6 bg-[#2d1b4e]/95 backdrop-blur-sm border border-[#a855f7]/20 rounded-md p-2 z-20 shadow-[0_0_8px_rgba(168,85,247,0.2)]">
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
    </div>
  );
}
