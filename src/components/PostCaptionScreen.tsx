import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateExpiryTime } from '@/lib/time-utils';
import { captureLocationWithVenue, createNewVenue, type LocationData } from '@/lib/location-service';

interface PostCaptionScreenProps {
  imageFile: File;
  imagePreview: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function PostCaptionScreen({ imageFile, imagePreview, onBack, onSuccess }: PostCaptionScreenProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [showVenueInput, setShowVenueInput] = useState(false);
  const [customVenueName, setCustomVenueName] = useState('');

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchActiveCheckInOrCaptureLocation();
    }
  }, [user]);

  const fetchActiveCheckInOrCaptureLocation = async () => {
    if (!user) return;
    
    setCapturingLocation(true);
    try {
      // First check if user has an active check-in
      const { data: activeStatus } = await supabase
        .from('night_statuses')
        .select('venue_id, venue_name, lat, lng')
        .eq('user_id', user.id)
        .eq('status', 'out')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (activeStatus?.venue_name) {
        // Use checked-in venue automatically
        setLocation(activeStatus.venue_name);
        setLocationData({
          lat: activeStatus.lat || 0,
          lng: activeStatus.lng || 0,
          timestamp: new Date().toISOString(),
          venueId: activeStatus.venue_id || undefined,
          venueName: activeStatus.venue_name,
        });
        setCapturingLocation(false);
      } else {
        // Fall back to GPS capture
        captureLocation();
      }
    } catch (error) {
      console.error('Error checking active status:', error);
      captureLocation();
    }
  };

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .single();
    setProfile(data);
  };

  const captureLocation = async () => {
    setCapturingLocation(true);
    try {
      const locData = await captureLocationWithVenue();
      setLocationData(locData);
      if (locData.venueName) {
        setLocation(locData.venueName);
      } else {
        setShowVenueInput(true);
      }
    } catch (error) {
      console.error('Error capturing location:', error);
    } finally {
      setCapturingLocation(false);
    }
  };

  const handleCreateVenue = async () => {
    if (!customVenueName.trim() || !locationData) return;

    setLoading(true);
    try {
      const venueId = await createNewVenue(
        customVenueName.trim(),
        locationData.lat,
        locationData.lng,
        'Unknown',
        'bar'
      );

      if (venueId) {
        setLocationData({
          ...locationData,
          venueId,
          venueName: customVenueName.trim(),
        });
        setLocation(customVenueName.trim());
        setShowVenueInput(false);
        toast.success('Venue added!');
      }
    } catch (error) {
      console.error('Error creating venue:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
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

  const handleShare = async () => {
    if (!caption.trim()) {
      toast.error('Please add a caption');
      return;
    }
    if (!user) return;

    setLoading(true);

    try {
      const imageUrl = await uploadImage();
      if (!imageUrl) {
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        text: caption,
        image_url: imageUrl,
        venue_name: locationData?.venueName || location || null,
        venue_id: locationData?.venueId || null,
        expires_at: calculateExpiryTime(),
      });

      if (error) throw error;

      toast.success('Post shared!');
      onSuccess();
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to share post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </button>
        <span className="text-white font-semibold text-lg">New Post</span>
        <Button
          onClick={handleShare}
          disabled={loading || !caption.trim()}
          className="bg-[#d4ff00] text-black hover:bg-[#d4ff00]/90 font-semibold px-6"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share'}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* User + Caption Row */}
        <div className="flex gap-3 p-4">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-[#a855f7] text-white">
              {profile?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 flex gap-3">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption..."
              className="flex-1 bg-transparent border-none text-white placeholder:text-white/40 resize-none min-h-[100px] p-0 focus-visible:ring-0"
              maxLength={500}
            />
            
            {/* Image Preview Thumbnail */}
            <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-white/10" />

        {/* Location */}
        <div className="p-4">
          <div className="flex items-center gap-3 text-white/60">
            <MapPin className="h-5 w-5" />
            {capturingLocation ? (
              <span className="text-sm">Detecting location...</span>
            ) : showVenueInput ? (
              <div className="flex-1 flex gap-2">
                <Input
                  value={customVenueName}
                  onChange={(e) => setCustomVenueName(e.target.value)}
                  placeholder="Add location"
                  className="bg-transparent border-white/20 text-white placeholder:text-white/40"
                />
                <Button
                  onClick={handleCreateVenue}
                  disabled={!customVenueName.trim() || loading}
                  size="sm"
                  className="bg-[#a855f7] hover:bg-[#a855f7]/90"
                >
                  Add
                </Button>
              </div>
            ) : location ? (
              <button 
                onClick={() => setShowVenueInput(true)}
                className="text-white hover:text-white/80 transition-colors"
              >
                {location}
              </button>
            ) : (
              <button
                onClick={() => setShowVenueInput(true)}
                className="text-white/60 hover:text-white transition-colors"
              >
                Add location
              </button>
            )}
          </div>
        </div>

        <div className="h-px bg-white/10" />

        {/* Large Image Preview */}
        <div className="p-4">
          <div className="aspect-square w-full max-w-md mx-auto rounded-xl overflow-hidden">
            <img
              src={imagePreview}
              alt="Post preview"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Character Count */}
        <div className="px-4 pb-4">
          <p className="text-xs text-white/40 text-right">
            {caption.length}/500
          </p>
        </div>
      </div>
    </div>
  );
}
