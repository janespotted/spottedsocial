import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendLocation | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (user) {
      fetchFriendsLocations();
    }
  }, [user]);

  const fetchFriendsLocations = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (friendships) {
      const friendIds = friendships.map(f => f.friend_id);
      
      const { data: friendLocations } = await supabase
        .from('night_statuses')
        .select(`
          *,
          profiles:user_id (
            display_name,
            avatar_url
          )
        `)
        .in('user_id', friendIds)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());

      setFriends(friendLocations || []);
    }
  };

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
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

    map.current.on('load', () => {
      // Add purple tint to the map
      map.current?.setPaintProperty('background', 'background-color', '#1a0f2e');
    });

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || friends.length === 0) return;

    // Clear existing markers
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

    // Fit map to show all friends
    if (friends.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      friends.forEach(friend => {
        bounds.extend([friend.lng, friend.lat]);
      });
      map.current.fitBounds(bounds, { padding: 80 });
    }
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

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-6 z-10">
        <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
        <div className="text-4xl font-bold text-[#d4ff00]">S</div>
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
