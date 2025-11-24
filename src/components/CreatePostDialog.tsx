import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, X, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { calculateExpiryTime } from '@/lib/time-utils';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePostDialog({ open, onOpenChange }: CreatePostDialogProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (user && open) {
      fetchProfile();
      fetchCurrentLocation();
    }
  }, [user, open]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();
    
    setProfile(data);
  };

  const fetchCurrentLocation = async () => {
    // Check if user has an active "out" status with a location
    const { data } = await supabase
      .from('night_statuses')
      .select('venue_name, status')
      .eq('user_id', user?.id)
      .single();

    if (data && data.status === 'out' && data.venue_name) {
      setLocation(data.venue_name);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image must be less than 10MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    const fileExt = imageFile.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError, data } = await supabase.storage
      .from('post-images')
      .upload(fileName, imageFile);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      toast.error('Failed to upload image');
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handlePost = async () => {
    if (!caption.trim()) {
      toast.error('Please add a caption');
      return;
    }

    if (!user) return;

    setLoading(true);

    try {
      // Upload image if present
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) {
          setLoading(false);
          return;
        }
      }

      // Create post
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        text: caption,
        image_url: imageUrl,
        venue_name: location || null,
        expires_at: calculateExpiryTime(),
      });

      if (error) throw error;

      toast.success('Post created!');
      
      // Reset form
      setCaption('');
      setLocation('');
      setImageFile(null);
      setImagePreview(null);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a0f2e] border-2 border-[#a855f7]/40 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#d4ff00]">Create Post</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* User Info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-[#a855f7] shadow-[0_0_15px_rgba(168,85,247,0.6)]">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#0a0118] text-white">
                {profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{profile?.display_name}</p>
              <p className="text-sm text-white/60">@{profile?.username}</p>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-white/80 mb-2 block">Photo (optional)</Label>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg border-2 border-[#a855f7]/40"
                />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-2 bg-[#1a0f2e]/90 rounded-full border border-[#a855f7]/40 hover:bg-[#a855f7]/20 transition-colors"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#a855f7]/40 rounded-lg cursor-pointer hover:border-[#a855f7]/60 transition-colors">
                <Camera className="h-8 w-8 text-white/60 mb-2" />
                <span className="text-sm text-white/60">Tap to add photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Caption */}
          <div>
            <Label className="text-white/80 mb-2 block">Caption *</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="What's happening?"
              className="bg-[#0a0118] border-[#a855f7]/40 text-white placeholder:text-white/40 min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-white/40 mt-1 text-right">
              {caption.length}/500
            </p>
          </div>

          {/* Location */}
          <div>
            <Label className="text-white/80 mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where are you?"
              className="bg-[#0a0118] border-[#a855f7]/40 text-white placeholder:text-white/40"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-[#a855f7]/40 text-white hover:bg-[#a855f7]/10"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePost}
              className="flex-1 bg-[#d4ff00] text-[#1a0f2e] hover:bg-[#d4ff00]/90 font-semibold"
              disabled={loading}
            >
              {loading ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
