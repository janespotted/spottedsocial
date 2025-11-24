import { useEffect, useState } from 'react';
import { useVenueIdCard } from '@/contexts/VenueIdCardContext';
import { useFriendIdCard } from '@/contexts/FriendIdCardContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Clock, DollarSign, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VenueData {
  id: string;
  name: string;
  neighborhood: string;
  type: string;
  lat: number;
  lng: number;
}

interface FriendAtVenue {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function VenueIdCard() {
  const { selectedVenueId, closeVenueCard } = useVenueIdCard();
  const { openFriendCard } = useFriendIdCard();
  const { user } = useAuth();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [friendsAtVenue, setFriendsAtVenue] = useState<FriendAtVenue[]>([]);
  const [distance, setDistance] = useState<string>('--');
  const [timeIndicator] = useState('10m'); // Placeholder
  const [priceIndicator] = useState('$20'); // Placeholder

  useEffect(() => {
    if (selectedVenueId) {
      fetchVenueData();
    }
  }, [selectedVenueId]);

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

        // Fetch friends at this venue
        const { data: statuses } = await supabase
          .from('night_statuses')
          .select('user_id')
          .eq('venue_name', venueData.name)
          .not('expires_at', 'is', null)
          .gt('expires_at', new Date().toISOString());

        if (statuses && statuses.length > 0) {
          const userIds = statuses.map(s => s.user_id);
          
          // Get friend profiles
          const { data: friendships } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id)
            .eq('status', 'accepted');

          const friendIds = friendships?.map(f => f.friend_id) || [];
          const friendsAtVenueIds = userIds.filter(id => friendIds.includes(id));

          if (friendsAtVenueIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .in('id', friendsAtVenueIds);

            setFriendsAtVenue(profiles || []);
          } else {
            setFriendsAtVenue([]);
          }
        } else {
          setFriendsAtVenue([]);
        }
      }
    } catch (error) {
      console.error('Error fetching venue data:', error);
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
      // Dispatch custom event to center map
      window.dispatchEvent(new CustomEvent('centerMapOnVenue', {
        detail: { lat: venue.lat, lng: venue.lng }
      }));
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeVenueCard();
    }
  };

  if (!selectedVenueId || !venue) return null;

  const visibleFriends = friendsAtVenue.slice(0, 4);
  const remainingCount = friendsAtVenue.length - visibleFriends.length;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="absolute bottom-0 left-0 right-0 animate-slide-in-up">
        <div className="bg-gradient-to-br from-[#2d1b4e] to-[#1a0f2e] border-t-2 border-[#a855f7]/50 rounded-t-3xl shadow-[0_-10px_50px_rgba(168,85,247,0.5)] p-6 mb-16">
          {/* Top Row: Image + Info */}
          <div className="flex gap-4 mb-4">
            {/* Venue Image */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-xl overflow-hidden bg-gradient-to-br from-[#a855f7]/20 to-[#d4ff00]/20 border border-[#a855f7]/30">
                {/* Placeholder gradient - replace with actual venue image when available */}
                <div className="w-full h-full bg-gradient-to-br from-[#a855f7]/40 to-[#d4ff00]/40" />
              </div>
              {/* Location marker badge */}
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#d4ff00] border-2 border-[#2d1b4e] flex items-center justify-center shadow-[0_0_15px_rgba(212,255,0,0.6)]">
                <Plus className="w-4 h-4 text-[#2d1b4e]" />
              </div>
            </div>

            {/* Venue Info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1 truncate">
                {venue.name}
              </h2>
              <p className="text-sm text-white/60 italic">
                {venue.neighborhood} ({distance} miles)
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#a855f7]/10 rounded-lg border border-[#a855f7]/20">
              <Clock className="w-4 h-4 text-[#d4ff00]" />
              <span className="text-[#d4ff00] font-semibold text-sm">{timeIndicator}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#a855f7]/10 rounded-lg border border-[#a855f7]/20">
              <DollarSign className="w-4 h-4 text-[#d4ff00]" />
              <span className="text-[#d4ff00] font-semibold text-sm">{priceIndicator}</span>
            </div>
          </div>

          {/* Bottom Row: Friends + Map Pin */}
          <div className="flex items-center justify-between">
            {/* Friend Avatars */}
            <div className="flex items-center gap-2">
              {friendsAtVenue.length > 0 ? (
                <>
                  <div className="flex -space-x-2">
                    {visibleFriends.map((friend) => (
                      <Avatar
                        key={friend.id}
                        className="w-10 h-10 border-2 border-[#2d1b4e] cursor-pointer hover:scale-110 transition-transform"
                        onClick={() => openFriendCard({
                          userId: friend.id,
                          displayName: friend.display_name,
                          avatarUrl: friend.avatar_url,
                        })}
                      >
                        <AvatarImage 
                          src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.display_name}`} 
                        />
                        <AvatarFallback className="bg-[#a855f7] text-white">
                          {friend.display_name[0]}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {remainingCount > 0 && (
                    <span className="text-sm text-white/60 ml-1">
                      +{remainingCount}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-white/40">No friends here yet</span>
              )}
            </div>

            {/* Map Pin Button */}
            <button
              onClick={handleMapPinClick}
              className="w-12 h-12 rounded-full bg-white hover:bg-white/90 flex items-center justify-center shadow-lg transition-all hover:scale-110"
              aria-label="Show on map"
            >
              <MapPin className="w-6 h-6 text-[#a855f7]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
