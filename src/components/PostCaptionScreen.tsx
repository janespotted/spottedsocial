import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Loader2, Users, Heart, Share2, ChevronDown, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateExpiryTime } from '@/lib/time-utils';
import { captureLocationWithVenue, createNewVenue, type LocationData } from '@/lib/location-service';
import { validatePostText } from '@/lib/validation-schemas';

type PostVisibility = 'close_friends' | 'all_friends' | 'mutual_friends';

interface PostCaptionScreenProps {
  imageFile: File;
  imagePreview: string;
  mediaType?: 'image';
  onBack: () => void;
  onSuccess: () => void;
}

const visibilityOptions = [
  { value: 'close_friends' as const, label: 'Close Friends', icon: Heart, description: 'Only your closest friends' },
  { value: 'all_friends' as const, label: 'All Friends', icon: Users, description: 'Everyone you are friends with' },
  { value: 'mutual_friends' as const, label: 'Mutual Friends', icon: Share2, description: 'Friends + their friends' },
];

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
  const [visibility, setVisibility] = useState<PostVisibility>('all_friends');
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);

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
      const { data: activeStatus } = await supabase
        .from('night_statuses')
        .select('venue_id, venue_name, lat, lng')
        .eq('user_id', user.id)
        .eq('status', 'out')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (activeStatus?.venue_name) {
        setLocation(activeStatus.venue_name);
        setLocationData({
          lat: activeStatus.lat || 0,
          lng: activeStatus.lng || 0,
          accuracy: 0,
          timestamp: new Date().toISOString(),
          venueId: activeStatus.venue_id || undefined,
          venueName: activeStatus.venue_name,
          nearbyVenues: [],
        });
        setCapturingLocation(false);
      } else {
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

  const uploadMedia = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    const fileExt = imageFile.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(fileName, imageFile);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      toast.error('Failed to upload media');
      return null;
    }

    return fileName;
  };

  const handleShare = async () => {
    const trimmedCaption = caption.trim();
    if (trimmedCaption.length > 500) {
      toast.error('Caption must be less than 500 characters');
      return;
    }
    if (!user) return;

    setLoading(true);

    try {
      const imageUrl = await uploadMedia();
      if (!imageUrl) {
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        text: trimmedCaption,
        image_url: imageUrl,
        media_type: 'image',
        venue_name: locationData?.venueName || location || null,
        venue_id: locationData?.venueId || null,
        expires_at: calculateExpiryTime(),
        visibility,
      } as any);

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

  const getVisibilityLabel = () => {
    const option = visibilityOptions.find(o => o.value === visibility);
    return option?.label || 'All Friends';
  };

  const getVisibilityIcon = () => {
    const option = visibilityOptions.find(o => o.value === visibility);
    return option?.icon || Users;
  };

  const VisibilityIcon = getVisibilityIcon();

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] flex flex-col pt-[env(safe-area-inset-top,0px)]">
      {/* Header - tighter padding */}
      <div className="flex items-center justify-between px-3 py-3">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>
        <span className="text-white font-semibold">New Post</span>
        <Button
          onClick={handleShare}
          disabled={loading}
          size="sm"
          className="bg-white text-[#1a0f2e] hover:bg-white/90 font-semibold px-5 rounded-full disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share'}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero Image - edge-to-edge with rounded corners */}
        <div className="px-3 pb-3">
          <div className="aspect-[4/5] w-full rounded-2xl overflow-hidden">
            <img
              src={imagePreview}
              alt="Post preview"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Caption - lightweight, borderless */}
        <div className="px-3 py-2">
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-[#a855f7] text-white text-sm">
                {profile?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption..."
                className="w-full bg-transparent text-white placeholder:text-white/30 resize-none text-base leading-relaxed focus:outline-none min-h-[60px]"
                maxLength={500}
                rows={2}
              />
              <p className="text-xs text-white/30 text-right">{caption.length}/500</p>
            </div>
          </div>
        </div>

        {/* Location - subtle pill style */}
        <div className="px-3 py-2">
          {capturingLocation ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Detecting location...</span>
            </div>
          ) : showVenueInput ? (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-white/40 flex-shrink-0" />
              <Input
                value={customVenueName}
                onChange={(e) => setCustomVenueName(e.target.value)}
                placeholder="Add location"
                className="flex-1 h-8 bg-white/5 border-white/10 text-white text-sm placeholder:text-white/30 rounded-full px-3"
              />
              <Button
                onClick={handleCreateVenue}
                disabled={!customVenueName.trim() || loading}
                size="sm"
                className="h-8 bg-[#a855f7] hover:bg-[#a855f7]/90 rounded-full px-3"
              >
                Add
              </Button>
              <button
                onClick={() => setShowVenueInput(false)}
                className="p-1 text-white/40 hover:text-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVenueInput(true)}
                className="flex items-center gap-2 text-sm"
              >
                <MapPin className="h-4 w-4 text-white/40" />
                <span className={location ? "text-white" : "text-white/40"}>
                  {location || "Add location"}
                </span>
              </button>
              {location !== 'In Uber 🚗' && (
                <button
                  onClick={() => {
                    setLocation('In Uber 🚗');
                    setLocationData(prev => prev ? { ...prev, venueName: 'In Uber 🚗', venueId: undefined } : null);
                    setShowVenueInput(false);
                  }}
                  className="ml-auto flex items-center gap-1 text-xs text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10 rounded-full px-2.5 py-1 transition-colors"
                >
                  🚗 In Uber
                </button>
              )}
            </div>
          )}
        </div>

        {/* Audience - single row, opens sheet */}
        <button 
          onClick={() => setShowAudienceSheet(true)}
          className="w-full flex items-center justify-between px-3 py-3 mt-1"
        >
          <div className="flex items-center gap-2">
            <VisibilityIcon className="h-4 w-4 text-white/40" />
            <span className="text-sm text-white/60">Audience</span>
          </div>
          <div className="flex items-center gap-1.5 text-white">
            <span className="text-sm">{getVisibilityLabel()}</span>
            <ChevronDown className="h-4 w-4 text-white/40" />
          </div>
        </button>
      </div>

      {/* Audience Selection Sheet */}
      <Sheet open={showAudienceSheet} onOpenChange={setShowAudienceSheet}>
        <SheetContent side="bottom" className="bg-[#1a0f2e] border-white/10 rounded-t-2xl px-0 pb-8">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="text-white text-center">Who can see this?</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col">
            {visibilityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setVisibility(option.value);
                  setShowAudienceSheet(false);
                }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  visibility === option.value ? 'bg-[#a855f7]/20' : 'bg-white/5'
                }`}>
                  <option.icon className={`h-5 w-5 ${
                    visibility === option.value ? 'text-[#a855f7]' : 'text-white/60'
                  }`} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-white">{option.label}</p>
                  <p className="text-xs text-white/40">{option.description}</p>
                </div>
                {visibility === option.value && (
                  <Check className="h-5 w-5 text-[#a855f7]" />
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
