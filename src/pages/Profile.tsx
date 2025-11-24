import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Users, ChevronDown, Share2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface WishlistPlace {
  id: string;
  venue_name: string;
  venue_image_url: string | null;
}

export default function Profile() {
  const { user } = useAuth();
  const { openCheckIn } = useCheckIn();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [placesCount, setPlacesCount] = useState(0);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [locationSharingLevel, setLocationSharingLevel] = useState('all_friends');
  const [wishlistPlaces, setWishlistPlaces] = useState<WishlistPlace[]>([]);

  useEffect(() => {
    if (user) {
      fetchProfileData();
    }
  }, [user]);

  const fetchProfileData = async () => {
    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setLocationSharingLevel(profileData.location_sharing_level || 'all_friends');
    }

    // Check if user is currently sharing location
    const { data: nightStatus } = await supabase
      .from('night_statuses')
      .select('*')
      .eq('user_id', user?.id)
      .not('venue_name', 'is', null)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    setIsLocationSharing(!!nightStatus);

    // Get friends count
    const { data: friendships } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    setFriendsCount(friendships?.length || 0);

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

  // Mock venue images for wishlist
  const mockVenueImages = [
    'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=400',
    'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=400',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400',
    'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400',
    'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400',
    'https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=400',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <div className="flex-1" />
          <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
          <div className="flex-1 flex justify-end">
            <button 
              onClick={openCheckIn}
              className="w-10 h-10 rounded-full bg-[#d4ff00] flex items-center justify-center text-2xl font-bold text-[#1a0f2e] hover:scale-110 transition-transform"
            >
              S
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* User Identity */}
        <div>
          <h2 className="text-xl font-bold text-white">@{profile?.username || 'username'}</h2>
          <div className="flex items-center gap-2 mt-1">
            {isLocationSharing ? (
              <>
                <span className="text-[#d4ff00] font-medium">Sharing Location</span>
                <MapPin className="h-4 w-4 text-[#d4ff00] fill-[#d4ff00]" />
              </>
            ) : (
              <span className="text-white/40">Not Sharing Location</span>
            )}
          </div>
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
        
        {/* Demo Settings Button */}
        <Button
          onClick={() => navigate('/demo-settings')}
          variant="outline"
          className="w-full border-[#a855f7]/40 text-[#d4ff00] hover:bg-[#a855f7]/10 rounded-full"
        >
          Demo Settings
        </Button>

        {/* Location Sharing Card */}
        <div className="bg-[#2d1b4e]/60 border border-white/20 rounded-2xl p-4">
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

        {/* Wishlist Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">Wishlist</h3>
                <ChevronDown className="h-4 w-4 text-white/60" />
              </div>
              <p className="text-white/60 text-sm">Only you can see</p>
            </div>
          </div>

          {/* Wishlist Grid */}
          {wishlistPlaces.length > 0 ? (
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
            <div className="text-center py-12">
              <p className="text-white/60">Add places you want to go</p>
              <p className="text-white/40 text-sm mt-2">to your Wishlist</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
