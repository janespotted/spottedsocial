import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Ghost, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Home() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home'>('home');
  const [friends, setFriends] = useState<any[]>([]);
  const [currentStatus, setCurrentStatus] = useState<any>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCurrentStatus();
      fetchFriendsStatus();
    }
  }, [user]);

  const fetchCurrentStatus = async () => {
    const { data } = await supabase
      .from('night_statuses')
      .select('*')
      .eq('user_id', user?.id)
      .maybeSingle();
    
    if (data) {
      setCurrentStatus(data);
      setSelectedStatus(data.status);
    }
  };

  const fetchFriendsStatus = async () => {
    const { data: friendships } = await supabase
      .from('friendships')
      .select('friend_id')
      .eq('user_id', user?.id)
      .eq('status', 'accepted');

    if (friendships) {
      const friendIds = friendships.map(f => f.friend_id);
      
      const { data: friendStatuses } = await supabase
        .from('night_statuses')
        .select(`
          *,
          profiles:user_id (
            display_name,
            username,
            avatar_url
          )
        `)
        .in('user_id', friendIds)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());

      setFriends(friendStatuses || []);
    }
  };

  const calculateExpiryTime = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow.toISOString();
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Spotted App',
          },
        }
      );
      const data = await response.json();
      
      // Try to get a meaningful location name
      const address = data.address;
      const locationName = 
        address?.amenity || 
        address?.building || 
        address?.shop || 
        address?.restaurant || 
        address?.bar || 
        address?.road || 
        address?.neighbourhood || 
        address?.suburb || 
        address?.city ||
        'Current Location';
      
      return locationName;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return 'Current Location';
    }
  };

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home') => {
    setSelectedStatus(status);

    if (status === 'out' || status === 'heading_out') {
      setIsDetectingLocation(true);
      
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Get location name from coordinates
            const venueName = await reverseGeocode(lat, lng);
            
            // Immediately update status with detected location
            await updateStatus(status, lat, lng, venueName);
            setIsDetectingLocation(false);
          },
          (error) => {
            setIsDetectingLocation(false);
            toast({
              variant: 'destructive',
              title: 'Location access denied',
              description: 'Please enable location services to use this feature.',
            });
          }
        );
      } else {
        setIsDetectingLocation(false);
        toast({
          variant: 'destructive',
          title: 'Location not available',
          description: 'Your device does not support location services.',
        });
      }
    } else {
      await updateStatus(status, null, null, null);
    }
  };

  const updateStatus = async (
    status: 'out' | 'heading_out' | 'home',
    lat: number | null,
    lng: number | null,
    venue: string | null
  ) => {
    try {
      const statusData = {
        user_id: user?.id,
        status,
        lat,
        lng,
        venue_name: venue,
        updated_at: new Date().toISOString(),
        expires_at: status === 'home' ? null : calculateExpiryTime(),
      };

      const { error } = await supabase
        .from('night_statuses')
        .upsert(statusData, { onConflict: 'user_id' });

      if (error) throw error;

      if (status !== 'home' && lat && lng && venue) {
        await supabase.from('checkins').insert({
          user_id: user?.id,
          venue_name: venue,
          lat,
          lng,
        });
      }

      toast({
        title: 'Status updated!',
        description: status === 'home' ? "You're staying in." : status === 'out' ? `You're out at ${venue}!` : `You're still deciding - heading to ${venue}!`,
      });

      fetchCurrentStatus();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };


  const getStatusLabel = (status: string) => {
    const labels = {
      out: 'Yes',
      heading_out: 'Still deciding',
      home: 'No',
    };
    return labels[status as keyof typeof labels] || 'No';
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      out: 'bg-primary text-primary-foreground',
      heading_out: 'bg-accent text-accent-foreground',
      home: 'bg-muted text-muted-foreground',
    };
    return badges[status as keyof typeof badges] || badges.home;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d2b5f] via-[#2a1f4a] to-black flex flex-col items-center justify-between p-6 pb-20">
      {/* Header */}
      <div className="w-full flex items-start justify-between pt-8">
        <h1 className="text-3xl font-light tracking-[0.3em] text-white">Spotted</h1>
        <div className="text-4xl font-bold text-[#d4ff00]">S</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-12 w-full max-w-md">
        <h2 className="text-5xl font-bold text-[#d4ff00] text-center leading-tight">
          Are You<br />Out?
        </h2>

        <div className="w-full space-y-4">
          <Button
            onClick={() => handleStatusUpdate('out')}
            variant="outline"
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            {isDetectingLocation && selectedStatus === 'out' ? 'Detecting location...' : 'Yes'}
          </Button>
          <Button
            onClick={() => handleStatusUpdate('home')}
            variant="outline"
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            No
          </Button>
          <Button
            onClick={() => handleStatusUpdate('heading_out')}
            variant="outline"
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-full border-2 border-white bg-transparent text-white hover:bg-white/10 hover:text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            {isDetectingLocation && selectedStatus === 'heading_out' ? 'Detecting location...' : 'Still Deciding...'}
          </Button>
        </div>
      </div>

      {/* Ghost Icon */}
      <div className="w-full flex justify-end">
        <Ghost className="h-8 w-8 text-white/60" />
      </div>

      {/* Friends List - Show as overlay when available */}
      {friends.length > 0 && (
        <Card className="fixed bottom-24 left-4 right-4 p-4 bg-background/95 backdrop-blur space-y-3 max-h-64 overflow-y-auto">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Tonight's Friends</h3>
          </div>
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.user_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">{friend.profiles?.display_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{friend.profiles?.display_name}</p>
                    <p className="text-xs text-muted-foreground">{friend.venue_name}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(friend.status)}`}>
                  {getStatusLabel(friend.status)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
