import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { MapPin, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Home() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home'>('home');
  const [venueName, setVenueName] = useState('');
  const [showVenueInput, setShowVenueInput] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [currentStatus, setCurrentStatus] = useState<any>(null);

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

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home') => {
    setSelectedStatus(status);

    if (status === 'out' || status === 'heading_out') {
      setShowVenueInput(true);
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
        description: status === 'home' ? "You're home for the night." : `You're ${status.replace('_', ' ')} at ${venue}!`,
      });

      setShowVenueInput(false);
      setVenueName('');
      fetchCurrentStatus();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const handleVenueSubmit = () => {
    if (!venueName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a venue name',
      });
      return;
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateStatus(
            selectedStatus,
            position.coords.latitude,
            position.coords.longitude,
            venueName
          );
        },
        (error) => {
          toast({
            variant: 'destructive',
            title: 'Location access denied',
            description: 'Please enable location services to use this feature.',
          });
        }
      );
    }
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
    <div className="p-4 space-y-6">
      <div className="text-center space-y-4 pt-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Are you out tonight?
        </h1>
        <p className="text-muted-foreground">Let your friends know where you are</p>
      </div>

      {!showVenueInput ? (
        <div className="grid grid-cols-1 gap-4">
          <Button
            onClick={() => handleStatusUpdate('out')}
            variant={selectedStatus === 'out' ? 'default' : 'outline'}
            size="lg"
            className="h-16 text-lg font-semibold"
          >
            <MapPin className="mr-2 h-5 w-5" />
            Out
          </Button>
          <Button
            onClick={() => handleStatusUpdate('heading_out')}
            variant={selectedStatus === 'heading_out' ? 'default' : 'outline'}
            size="lg"
            className="h-16 text-lg font-semibold"
          >
            <MapPin className="mr-2 h-5 w-5" />
            Heading Out
          </Button>
          <Button
            onClick={() => handleStatusUpdate('home')}
            variant={selectedStatus === 'home' ? 'default' : 'outline'}
            size="lg"
            className="h-16 text-lg font-semibold"
          >
            Home
          </Button>
        </div>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Where are you?</label>
            <Input
              placeholder="Enter venue name"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVenueSubmit()}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleVenueSubmit} className="flex-1">
              Confirm
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowVenueInput(false);
                setVenueName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {friends.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Tonight's Friends</h2>
          </div>
          <div className="space-y-3">
            {friends.map((friend) => (
              <div key={friend.user_id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{friend.profiles?.display_name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{friend.profiles?.display_name}</p>
                    <p className="text-sm text-muted-foreground">{friend.venue_name}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(friend.status)}`}>
                  {friend.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
