import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Users } from 'lucide-react';

export default function Profile() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();

    if (data) {
      setProfile(data);
      setDisplayName(data.display_name || '');
      setUsername(data.username || '');
      setHomeCity(data.home_city || '');
      setBio(data.bio || '');
    }
  };

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          username,
          home_city: homeCity,
          bio,
        })
        .eq('id', user?.id);

      if (error) throw error;

      toast({
        title: 'Profile updated!',
        description: 'Your changes have been saved.',
      });
      fetchProfile();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!friendUsername.trim()) return;

    try {
      const { data: friendProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', friendUsername.replace('@', ''))
        .single();

      if (!friendProfile) {
        toast({
          variant: 'destructive',
          title: 'User not found',
          description: `No user found with username ${friendUsername}`,
        });
        return;
      }

      const { error } = await supabase.from('friendships').insert({
        user_id: user?.id,
        friend_id: friendProfile.id,
        status: 'accepted',
      });

      if (error) throw error;

      // Create reciprocal friendship
      await supabase.from('friendships').insert({
        user_id: friendProfile.id,
        friend_id: user?.id,
        status: 'accepted',
      });

      toast({
        title: 'Friend added!',
        description: `You're now friends with ${friendUsername}`,
      });
      setFriendUsername('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile</h1>
        <Button variant="ghost" size="icon" onClick={signOut}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarFallback className="text-2xl">{displayName[0]}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="text-xl font-bold">{displayName}</p>
            <p className="text-muted-foreground">@{username}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="homeCity">Home City</Label>
            <Input
              id="homeCity"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              placeholder="Where are you from?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
            />
          </div>

          <Button onClick={handleUpdateProfile} disabled={loading} className="w-full">
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Add Friends</h2>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="@username"
            value={friendUsername}
            onChange={(e) => setFriendUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
          />
          <Button onClick={handleAddFriend}>Add</Button>
        </div>
      </Card>
    </div>
  );
}
