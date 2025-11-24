import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface FriendLocation {
  user_id: string;
  lat: number;
  lng: number;
  venue_name: string;
  profiles: {
    display_name: string;
    avatar_url: string | null;
  };
}

export default function Map() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>(() => 
    localStorage.getItem('mapbox_token') || ''
  );
  const [showTokenInput, setShowTokenInput] = useState<boolean>(!localStorage.getItem('mapbox_token'));

  useEffect(() => {
    if (user) {
      fetchFriendsLocations();
      
      // Refresh every 15 seconds to get updated locations
      const interval = setInterval(fetchFriendsLocations, 15000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

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

      // Get list of accepted friends
      const { data: friendships } = await supabase
        .from('friendships')
        .select('friend_id')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      const friendIds = friendships?.map(f => f.friend_id) || [];

      if (friendIds.length === 0) {
        setFriends([]);
        
        // Center on user if they're out
        if (myProfile?.is_out && myProfile.last_known_lat && myProfile.last_known_lng && map.current) {
          map.current.flyTo({
            center: [myProfile.last_known_lng, myProfile.last_known_lat],
            zoom: 13,
          });
        }
        return;
      }

      // Get friends' profiles with location data
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_out, last_known_lat, last_known_lng, location_sharing_level')
        .in('id', friendIds)
        .eq('is_out', true)
        .not('last_known_lat', 'is', null)
        .not('last_known_lng', 'is', null);

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

      // Filter friends based on visibility rules
      const visibleFriends = (friendProfiles || []).filter((friend: any) => {
        const friendLevel = friend.location_sharing_level || 'all_friends';
        
        if (friendLevel === 'all_friends') return true;
        
        // For mutual_friends, check if user is also out
        if (friendLevel === 'mutual_friends') {
          return myProfile?.is_out === true;
        }
        
        // For close_friends, would need additional close_friends relationship data
        // For now, treat as all_friends
        return true;
      });

      const friendLocations: FriendLocation[] = visibleFriends.map((friend: any) => ({
        user_id: friend.id,
        lat: friend.last_known_lat,
        lng: friend.last_known_lng,
        venue_name: venueMap[friend.id] || 'Out',
        profiles: {
          display_name: friend.display_name || 'Unknown',
          avatar_url: friend.avatar_url,
        },
      }));

      setFriends(friendLocations);

      // Center map on user if they're out, otherwise show all friends
      if (map.current) {
        if (myProfile?.is_out && myProfile.last_known_lat && myProfile.last_known_lng) {
          map.current.flyTo({
            center: [myProfile.last_known_lng, myProfile.last_known_lat],
            zoom: 13,
          });
        } else if (friendLocations.length > 0) {
          // Fit bounds to show all friends
          const bounds = new mapboxgl.LngLatBounds();
          friendLocations.forEach(friend => {
            bounds.extend([friend.lng, friend.lat]);
          });
          map.current.fitBounds(bounds, { padding: 80 });
        }
      }
    } catch (error) {
      console.error('Error fetching friends locations:', error);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    if (!mapboxToken) {
      console.error('Mapbox token not found');
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

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      userMarkerRef.current?.remove();
      map.current?.remove();
    };
  }, [mapboxToken]);

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mapboxToken) {
      localStorage.setItem('mapbox_token', mapboxToken);
      setShowTokenInput(false);
    }
  };

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
      
      // Create avatar with neon ring
      el.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;">
          <div style="position: absolute; inset: 0; border-radius: 50%; border: 3px solid #a855f7; box-shadow: 0 0 20px rgba(168, 85, 247, 0.8), inset 0 0 20px rgba(168, 85, 247, 0.3);"></div>
          <img 
            src="${friend.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.profiles?.display_name}`}" 
            style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; padding: 4px;"
            alt="${friend.profiles?.display_name}"
          />
        </div>
      `;

      el.addEventListener('click', () => {
        setSelectedFriend(friend);
      });

      const marker = new mapboxgl.Marker(el)
        .setLngLat([friend.lng, friend.lat])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [friends]);

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

  return (
    <div className="relative h-screen w-full">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Mapbox Token Input */}
      {showTokenInput && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 space-y-4 bg-card border-border">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Mapbox Token Required</h2>
              <p className="text-sm text-muted-foreground">
                Enter your Mapbox public token to display the map. Get one at{' '}
                <a 
                  href="https://mapbox.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  mapbox.com
                </a>
              </p>
            </div>
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <input
                type="text"
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSI..."
                className="w-full px-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
              <Button type="submit" className="w-full">
                Save Token
              </Button>
            </form>
          </Card>
        </div>
      )}

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

      {/* Friend Info Card */}
      {selectedFriend && (
        <div className="absolute bottom-24 left-4 right-4 z-20">
          <Card className="bg-[#2d1b4e] border-2 border-[#a855f7] shadow-[0_0_30px_rgba(168,85,247,0.6)] p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                <AvatarImage src={selectedFriend.profiles?.avatar_url || undefined} />
                <AvatarFallback className="bg-[#1a0f2e] text-white">
                  {selectedFriend.profiles?.display_name?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white">
                  {selectedFriend.profiles?.display_name}
                </h3>
                <p className="text-[#d4ff00] font-medium">
                  {selectedFriend.venue_name}
                </p>
                <p className="text-white/60 text-sm">
                  {/* Distance calculation would need user's current location */}
                  Nearby
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 rounded-full font-semibold"
              >
                Meet Up
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 rounded-full"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            </div>

            <button
              onClick={() => setSelectedFriend(null)}
              className="absolute top-4 right-4 text-white/60 hover:text-white"
            >
              ✕
            </button>
          </Card>
        </div>
      )}

      {/* Pin Legend (optional) */}
      {!selectedFriend && friends.length > 0 && (
        <div className="absolute top-20 left-4 bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30 rounded-lg p-3 z-10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#a855f7] rounded-full shadow-[0_0_10px_rgba(168,85,247,0.8)]"></div>
            <span className="text-white/80 text-sm">{friends.length} friends out</span>
          </div>
        </div>
      )}
    </div>
  );
}
