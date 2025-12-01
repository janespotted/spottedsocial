import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ChevronLeft, LogOut, Users, Heart, Link2, Camera, Loader2, Trash2, AlertTriangle } from 'lucide-react';
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [locationSharing, setLocationSharing] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('all_friends');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or WebP image');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      // Get file extension
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${user.id}/avatar.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Add cache buster to URL
      const newAvatarUrl = `${publicUrl}?t=${Date.now()}`;

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(newAvatarUrl);
      toast.success('Profile photo updated!');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete account');
      }

      toast.success('Account deleted successfully');
      navigate('/auth');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-[#2d1b4e] to-[#0a0118]">
        <div className="max-w-[430px] mx-auto min-h-screen pb-24">
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
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.8)]">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="bg-[#1a0f2e] text-white text-2xl">
                {displayName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            {uploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <Button 
            variant="outline" 
            className="border-[#a855f7] text-white hover:bg-[#a855f7]/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
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

          {/* Danger Zone */}
          <div className="mt-8 pt-6 border-t border-red-500/30">
            <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </h3>
            <p className="text-sm text-white/60 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              variant="outline"
              className="w-full border-red-500 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </div>
        </div>
        </div>
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[90%] max-w-[400px] bg-[#1a0f2e] border-red-500/40 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription className="text-white/60">
              This will permanently delete your account and all your data including posts, 
              messages, check-ins, and friendships. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-white/80 text-sm">
              Type <span className="font-bold text-red-400">DELETE</span> to confirm
            </Label>
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE"
              className="mt-2 bg-[#2d1b4e]/60 border-red-500/20 text-white"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteConfirmation('');
              }}
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmation !== 'DELETE' || deleting}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
