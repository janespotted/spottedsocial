import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useFriendIdCard, FriendCardData } from '@/contexts/FriendIdCardContext';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare, Crosshair, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const venueMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showFriendsList, setShowFriendsList] = useState(false);
  const friendsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchFriendsLocations();
    }
  }, [user, demoEnabled]);

  // Real-time subscription for location updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to profile changes (location updates)
    const profileChannel = supabase
      .channel('profile-location-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          console.log('Profile location updated:', payload);
          // Refresh friends locations when any profile updates
          fetchFriendsLocations();
        }
      )
      .subscribe();

    // Subscribe to night status changes (venue updates)
    const statusChannel = supabase
      .channel('night-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'night_statuses',
        },
        (payload) => {
          console.log('Night status updated:', payload);
          // Refresh friends locations when statuses change
          fetchFriendsLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(statusChannel);
    };
  }, [user, demoEnabled]);

  const fetchFriendsLocations = async () => {
    if (!user) return;

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

      // When demo mode is ON, use static demo friends dataset
      if (demoEnabled) {
        // Static demo friends - always visible in demo mode
        const staticDemoFriends = [
          { name: 'Emma Davis', venue: 'The Nines', lat: 40.748817, lng: -73.985428, type: 'close' as const },
          { name: 'Noah Wilson', venue: 'Blue Note', lat: 40.730610, lng: -73.935242, type: 'direct' as const },
          { name: 'Sophia Martinez', venue: 'Spotted Lounge', lat: 40.758896, lng: -73.985130, type: 'close' as const },
          { name: 'Liam Anderson', venue: 'The Nines', lat: 40.749000, lng: -73.986000, type: 'mutual' as const },
          { name: 'Olivia Taylor', venue: 'Jazz Bar', lat: 40.741895, lng: -73.989308, type: 'direct' as const },
          { name: 'James Brown', venue: 'Rooftop NYC', lat: 40.752726, lng: -73.977229, type: 'mutual' as const },
          { name: 'Ava Johnson', venue: 'Blue Note', lat: 40.730800, lng: -73.935500, type: 'close' as const },
          { name: 'Lucas Garcia', venue: 'The Nines', lat: 40.748500, lng: -73.985800, type: 'direct' as const },
        ];

        friendLocations = staticDemoFriends.map((friend, index) => ({
          user_id: `demo-${index}`,
          lat: friend.lat,
          lng: friend.lng,
          venue_name: friend.venue,
          profiles: {
            display_name: friend.name,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.name}`,
          },
          relationshipType: friend.type,
        }));

        friendIds = friendLocations.map(f => f.user_id);
      } else {
        // Normal mode: show real friends only
        // Get list of accepted friends
        const { data: friendships } = await supabase
          .from('friendships')
          .select('friend_id')
          .eq('user_id', user.id)
          .eq('status', 'accepted');

        friendIds = friendships?.map(f => f.friend_id) || [];

        if (friendIds.length > 0) {
          // Get friends' profiles with location data
          const friendQuery = supabase
            .from('profiles')
            .select('id, display_name, avatar_url, is_out, last_known_lat, last_known_lng, location_sharing_level')
            .in('id', friendIds)
            .eq('is_out', true)
            .eq('is_demo', false)
            .not('last_known_lat', 'is', null)
            .not('last_known_lng', 'is', null);

          const { data: friendProfiles } = await friendQuery;

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

          // Get relationship types (close friends, mutual friends)
          const { data: closeFriends } = await supabase
            .from('close_friends')
            .select('close_friend_id')
            .eq('user_id', user.id);

          const closeFriendIds = new Set(closeFriends?.map(cf => cf.close_friend_id) || []);

          // Determine relationship type for each friend
          const relationshipTypes: Record<string, 'close' | 'direct' | 'mutual'> = {};
          
          for (const friendId of friendIds) {
            if (closeFriendIds.has(friendId)) {
              relationshipTypes[friendId] = 'close';
            } else {
              // Check if mutual friend (friends-of-friends)
              const { data: commonFriends } = await supabase
                .from('friendships')
                .select('friend_id')
                .eq('user_id', friendId)
                .eq('status', 'accepted')
                .in('friend_id', friendIds);

              const isMutual = commonFriends && commonFriends.length > 0;
              relationshipTypes[friendId] = isMutual ? 'mutual' : 'direct';
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

      // Fetch venues and calculate heat scores
      await fetchVenuesWithHeatScores(friendIds);
    } catch (error) {
      console.error('Error fetching friends locations:', error);
    }
  };

  const fetchVenuesWithHeatScores = async (friendIds: string[]) => {
    try {
      // Fetch all venues (only demo venues for now)
      const { data: venuesData } = await supabase
        .from('venues')
        .select('*')
        .eq('is_demo', true);

      if (!venuesData) return;

      // Calculate heat score for each venue
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const venuesWithHeat = await Promise.all(
        venuesData.map(async (venue) => {
          // Count friends at this venue
          const friendsAtVenue = friends.filter(
            (f) => f.venue_name.toLowerCase() === venue.name.toLowerCase()
          ).length;

          // Count recent posts at this venue
          const { data: recentPosts } = await supabase
            .from('posts')
            .select('id')
            .eq('venue_name', venue.name)
            .gte('created_at', twoHoursAgo);

          // Count recent yaps at this venue
          const { data: recentYaps } = await supabase
            .from('yap_messages')
            .select('id')
            .eq('venue_name', venue.name)
            .gte('created_at', twoHoursAgo);

          const heatScore = friendsAtVenue + (recentPosts?.length || 0) + (recentYaps?.length || 0);

          return {
            ...venue,
            heatScore,
          };
        })
      );

      // Filter venues within radius if user has location
      let filteredVenues = venuesWithHeat;
      if (userLocation) {
        const radius = 5; // miles
        filteredVenues = venuesWithHeat.filter((venue) => {
          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            venue.lat,
            venue.lng
          );
          return parseFloat(distance) <= radius;
        });
      }

      // Sort by heat score
      filteredVenues.sort((a, b) => b.heatScore - a.heatScore);

      setVenues(filteredVenues);
    } catch (error) {
      console.error('Error fetching venues:', error);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      console.error('MAPBOX token missing – set VITE_MAPBOX_PUBLIC_TOKEN in environment');
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-73.985428, 40.748817], // NYC default
      zoom: 13,
    });

    // Map is ready - no need to modify background layer

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
      markersRef.current.forEach(marker => marker.remove());
      venueMarkersRef.current.forEach(marker => marker.remove());
      userMarkerRef.current?.remove();
      map.current?.remove();
    };
  }, []);

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
        <div style="position: absolute; inset: 0; border-radius: 50%; border: 4px solid #d4ff00; box-shadow: 0 0 30px rgba(212, 255, 0, 0.9), inset 0 0 20px rgba(212, 255, 0, 0.4);"></div>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; background: #d4ff00; border-radius: 50%; box-shadow: 0 0 10px rgba(212, 255, 0, 1);"></div>
      </div>
    `;

    userMarkerRef.current = new mapboxgl.Marker(el)
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map.current);
  }, [userLocation]);

  useEffect(() => {
    if (!map.current) return;

    // Clear existing friend markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each friend
    friends.forEach((friend) => {
      const el = document.createElement('div');
      el.className = 'friend-marker';
      el.style.width = '60px';
      el.style.height = '60px';
      el.style.cursor = 'pointer';
      el.style.position = 'relative';
      
      // Determine ring color and badge based on relationship type
      const ringColors = {
        close: { border: '#d4ff00', shadow: 'rgba(212, 255, 0, 0.8)', badge: '💛' },
        direct: { border: '#a855f7', shadow: 'rgba(168, 85, 247, 0.8)', badge: '' },
        mutual: { border: '#6366f1', shadow: 'rgba(99, 102, 241, 0.8)', badge: '🔗' },
      };
      
      const colors = ringColors[friend.relationshipType || 'direct'];
      
      // Create avatar with colored ring
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;">
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 3px solid ${colors.border}; box-shadow: 0 0 20px ${colors.shadow}, inset 0 0 20px ${colors.shadow.replace('0.8', '0.3')}"></div>
          <img 
            src="${friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`}" 
            style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; padding: 4px;"
            alt="${friend.profiles?.display_name}"
          />
          ${colors.badge ? `
            <div style="position: absolute; bottom: -2px; right: -2px; width: 20px; height: 20px; background: #1a0f2e; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid ${colors.border}; font-size: 12px;">
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

      const marker = new mapboxgl.Marker(el)
        .setLngLat([friend.lng, friend.lat])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [friends]);

  // Render venue markers
  useEffect(() => {
    if (!map.current) return;

    // Clear existing venue markers
    venueMarkersRef.current.forEach(marker => marker.remove());
    venueMarkersRef.current = [];

    // Add markers for each venue
    venues.forEach((venue, index) => {
      const isTopHot = index < 3 && venue.heatScore > 0;
      const size = venue.heatScore > 0 ? Math.min(50 + venue.heatScore * 5, 80) : 40;
      const opacity = venue.heatScore > 0 ? 1 : 0.5;

      const el = document.createElement('div');
      el.className = 'venue-marker';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.cursor = 'pointer';
      el.style.transition = 'all 0.3s ease';
      
      // Create venue pin with glow for hot venues
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          ${isTopHot ? `<div style="position: absolute; inset: -10px; border-radius: 50%; background: radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, transparent 70%); animation: pulse 2s infinite;"></div>` : ''}
          <div style="width: 100%; height: 100%; background: #a855f7; border-radius: 50%; opacity: ${opacity}; box-shadow: 0 0 ${isTopHot ? '30px' : '15px'} rgba(168, 85, 247, ${isTopHot ? '0.9' : '0.6'}); display: flex; align-items: center; justify-content: center; border: 3px solid rgba(255, 255, 255, 0.9);">
            <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        openVenueCard(venue.id);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([venue.lng, venue.lat])
        .addTo(map.current!);

      venueMarkersRef.current.push(marker);
    });
  }, [venues, friends]);

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
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-6 z-10">
        <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
        <button 
          onClick={openCheckIn} 
          className="text-4xl font-bold text-[#d4ff00] hover:scale-110 transition-transform"
        >
          S
        </button>
      </div>

      {/* Friends Out Pill + List */}
      {friends.length > 0 ? (
        <div ref={friendsListRef} className="absolute top-20 left-4 z-10 max-w-sm">
          {/* Clickable Pill */}
          <button
            onClick={toggleFriendsList}
            className="bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 hover:bg-[#2d1b4e] transition-colors w-full"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#a855f7] rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></div>
              <span className="text-white/80 text-sm">{friends.length} friends out</span>
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
        <div className="absolute top-20 left-4 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#a855f7]/30 rounded-full"></div>
            <span className="text-white/60 text-sm">No friends out</span>
          </div>
        </div>
      ) : null}

      {/* My Location Button */}
      <button
        onClick={centerOnMyLocation}
        className="absolute bottom-24 right-6 w-12 h-12 rounded-full bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/50 flex items-center justify-center z-10 hover:bg-[#2d1b4e] transition-colors shadow-[0_0_20px_rgba(168,85,247,0.4)]"
        aria-label="Center on my location"
      >
        <Crosshair className="w-5 h-5 text-white" />
      </button>

      {/* Legend */}
      <div className="absolute bottom-40 right-6 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-10 shadow-[0_0_20px_rgba(168,85,247,0.4)] max-w-[160px]">
        <p className="text-white/80 text-xs font-semibold mb-2">Relationship</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-[#d4ff00] flex items-center justify-center text-[8px] bg-[#1a0f2e] shadow-[0_0_8px_rgba(212,255,0,0.6)]">
              💛
            </div>
            <span className="text-white/70 text-xs">Close Friend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-[#a855f7] bg-[#1a0f2e] shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
            <span className="text-white/70 text-xs">Friend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-[#6366f1] flex items-center justify-center text-[8px] bg-[#1a0f2e] shadow-[0_0_8px_rgba(99,102,241,0.6)]">
              🔗
            </div>
            <span className="text-white/70 text-xs">Mutual</span>
          </div>
        </div>
      </div>
    </div>
  );
}
