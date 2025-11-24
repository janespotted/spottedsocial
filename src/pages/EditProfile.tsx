import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, LogOut, Users, Heart, Link2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationSharing, setLocationSharing] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('all_friends');

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
      setDisplayName(data.display_name || '');
      setUsername(data.username || '');
      setHomeCity(data.home_city || '');
      setBio(data.bio || '');
      setAvatarUrl(data.avatar_url || '');
      const sharing = data.location_sharing_level || 'all_friends';
      if (sharing === 'close_friends' || sharing === 'all_friends' || sharing === 'mutual_friends') {
        setLocationSharing(sharing);
      }
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          username,
          home_city: homeCity,
          bio,
          location_sharing_level: locationSharing,
        })
        .eq('id', user?.id);

      if (error) throw error;

      toast.success('Profile updated successfully!');
      navigate('/profile');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#1a0f2e]/95 backdrop-blur border-b border-[#a855f7]/20">
        <div className="flex items-center justify-between p-6">
          <button 
            onClick={() => navigate('/profile')}
            className="text-white/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-semibold text-white">Edit Profile</h1>
          <button 
            onClick={handleSignOut}
            className="text-white/60 hover:text-white transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <Avatar className="h-24 w-24 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className="bg-[#1a0f2e] text-white text-2xl">
              {displayName?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <Button 
            variant="outline" 
            className="border-[#a855f7] text-white hover:bg-[#a855f7]/10"
          >
            Change Photo
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-white">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white"
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-white">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white"
              placeholder="@username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="homeCity" className="text-white">Home City</Label>
            <Input
              id="homeCity"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white"
              placeholder="Where are you from?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio" className="text-white">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white min-h-[100px]"
              placeholder="Tell us about yourself..."
            />
          </div>

          {/* Location Sharing Privacy */}
          <div className="space-y-3">
            <Label className="text-white">Location Sharing</Label>
            <p className="text-sm text-white/60">Choose who can see your location when you're out</p>
            
            <div className="space-y-3 bg-[#2d1b4e]/40 rounded-lg p-4 border border-[#a855f7]/20">
              <button
                onClick={() => setLocationSharing('close_friends')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#a855f7]/10 transition-colors"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  locationSharing === 'close_friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {locationSharing === 'close_friends' && (
                    <div className="w-3 h-3 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <Heart className="w-5 h-5 text-[#d4ff00]" />
                <div className="flex-1 text-left">
                  <p className="text-white font-medium">Close Friends</p>
                  <p className="text-xs text-white/60">Only close friends you've marked</p>
                </div>
              </button>

              <button
                onClick={() => setLocationSharing('all_friends')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#a855f7]/10 transition-colors"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  locationSharing === 'all_friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {locationSharing === 'all_friends' && (
                    <div className="w-3 h-3 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <Users className="w-5 h-5 text-[#a855f7]" />
                <div className="flex-1 text-left">
                  <p className="text-white font-medium">All Friends</p>
                  <p className="text-xs text-white/60">All your direct friends</p>
                </div>
              </button>

              <button
                onClick={() => setLocationSharing('mutual_friends')}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#a855f7]/10 transition-colors"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  locationSharing === 'mutual_friends' ? 'border-[#d4ff00]' : 'border-white/40'
                }`}>
                  {locationSharing === 'mutual_friends' && (
                    <div className="w-3 h-3 rounded-full bg-[#d4ff00]" />
                  )}
                </div>
                <Link2 className="w-5 h-5 text-[#a855f7]" />
                <div className="flex-1 text-left">
                  <p className="text-white font-medium">Mutual Friends</p>
                  <p className="text-xs text-white/60">Friends-of-friends only</p>
                </div>
              </button>
            </div>

            <Button
              onClick={() => navigate('/profile/close-friends')}
              variant="outline"
              className="w-full border-[#a855f7] text-white hover:bg-[#a855f7]/10"
            >
              <Heart className="w-4 h-4 mr-2" />
              Manage Close Friends
            </Button>
          </div>

          <Button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
