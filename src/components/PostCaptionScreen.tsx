import { useState, useEffect } from 'react';
import { MapPin, Loader2, Users, Heart, Share2, ChevronRight, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateExpiryTime } from '@/lib/time-utils';
import { captureLocationWithVenue, type LocationData } from '@/lib/location-service';
import { validatePostText } from '@/lib/validation-schemas';

type PostVisibility = 'close_friends' | 'all_friends' | 'mutual_friends';

interface PostCaptionScreenProps {
  imageFile: File;
  imagePreview: string;
  mediaType?: 'image' | 'video';
  onBack: () => void;
  onSuccess: () => void;
}

const visibilityOptions = [
  { value: 'close_friends' as const, label: 'Close Friends', icon: Heart, description: 'Only your closest friends' },
  { value: 'all_friends' as const, label: 'All Friends', icon: Users, description: 'Everyone you are friends with' },
  { value: 'mutual_friends' as const, label: 'Mutual Friends', icon: Share2, description: 'Friends + their friends' },
];

export function PostCaptionScreen({ imageFile, imagePreview, mediaType = 'image', onBack, onSuccess }: PostCaptionScreenProps) {
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [showVenueInput, setShowVenueInput] = useState(false);
  const [customVenueName, setCustomVenueName] = useState('');
  const [venueSuggestions, setVenueSuggestions] = useState<{ id: string; name: string; neighborhood: string }[]>([]);
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

  const handleCreateVenue = () => {
    if (!customVenueName.trim() || !locationData) return;

    // Just use the name — no venue record created (requires admin approval)
    setLocationData({
      ...locationData,
      venueId: undefined,
      venueName: customVenueName.trim(),
    });
    setLocation(customVenueName.trim());
    setShowVenueInput(false);
    setCustomVenueName('');
  };

  // Venue autocomplete search
  useEffect(() => {
    if (!customVenueName.trim() || customVenueName.trim().length < 2) {
      setVenueSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name, neighborhood')
        .ilike('name', `%${customVenueName.trim()}%`)
        .limit(5);
      setVenueSuggestions(data || []);
    }, 250);
    return () => clearTimeout(timer);
  }, [customVenueName]);

  const selectVenueSuggestion = (venue: { id: string; name: string }) => {
    setCustomVenueName(venue.name);
    setLocation(venue.name);
    setLocationData(prev => prev ? { ...prev, venueId: venue.id, venueName: venue.name } : null);
    setShowVenueInput(false);
    setVenueSuggestions([]);
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    const defaultExt = mediaType === 'video' ? 'mp4' : 'jpg';
    const fileExt = imageFile.name.split('.').pop() || defaultExt;
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    let contentType = imageFile.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    if (contentType === 'image/jpg') contentType = 'image/jpeg';

    const { error: uploadError } = await supabase.storage
      .from('post-images')
      .upload(fileName, imageFile, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError.message, uploadError);
      toast.error(`Upload failed: ${uploadError.message}`);
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
        media_type: mediaType,
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

  return (
    <div className="fixed inset-0 z-[500] bg-[#110a24] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-11 shrink-0">
        <button onClick={onBack} className="p-1 -ml-1">
          <X className="h-5 w-5 text-white/70" />
        </button>
        <span className="text-white font-semibold text-base">New Post</span>
        <div className="w-6" />
      </div>

      {/* Photo — flexible height, caps at 45vh */}
      <div className="shrink min-h-0 px-4 pb-2">
        <div className="relative mx-auto rounded-2xl overflow-hidden bg-black/40 h-full" style={{ maxHeight: '45vh' }}>
          {mediaType === 'video' ? (
            <video
              src={imagePreview}
              autoPlay loop muted playsInline
              className="w-full h-full object-contain rounded-2xl"
              style={{ maxHeight: '45vh' }}
              onLoadedData={(e) => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            />
          ) : (
            <img
              src={imagePreview}
              alt="Post preview"
              className="w-full h-full object-contain rounded-2xl"
              style={{ maxHeight: '45vh' }}
            />
          )}
          <button
            onClick={onBack}
            className="absolute bottom-2 left-2 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-xs font-medium"
          >
            Retake
          </button>
        </div>
      </div>

      {/* Metadata — fixed height rows, no scroll */}
      <div className="shrink-0 px-5">
        {/* Caption — compact */}
        <div className="flex items-center gap-2.5 py-2">
          <Avatar className="h-7 w-7 flex-shrink-0">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-[#1a0a2e] text-white text-[10px]">
              {profile?.display_name?.[0] || 'U'}
            </AvatarFallback>
          </Avatar>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption..."
            className="flex-1 bg-transparent text-white placeholder:text-white/40 resize-none text-sm leading-snug focus:outline-none py-1"
            maxLength={500}
            rows={1}
            onFocus={(e) => { (e.target as HTMLTextAreaElement).rows = 3; }}
            onBlur={(e) => { (e.target as HTMLTextAreaElement).rows = 1; }}
          />
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Location row */}
        {capturingLocation ? (
          <div className="flex items-center gap-3 py-2.5">
            <Loader2 className="h-4 w-4 text-white/40 animate-spin" />
            <span className="text-white/40 text-sm">Detecting location...</span>
          </div>
        ) : showVenueInput ? (
          <div className="py-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-white/40 flex-shrink-0" />
              <Input
                value={customVenueName}
                onChange={(e) => setCustomVenueName(e.target.value)}
                placeholder="Search venues..."
                autoFocus
                className="flex-1 h-8 bg-white/5 border-white/10 text-white text-sm placeholder:text-white/30 rounded-lg px-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-white/20"
              />
              <Button
                onClick={handleCreateVenue}
                disabled={!customVenueName.trim() || loading}
                size="sm"
                className="h-8 bg-[#d4ff00] text-black hover:bg-[#d4ff00]/90 rounded-lg px-2.5 text-xs font-semibold"
              >
                Add
              </Button>
              <button
                onClick={() => { setShowVenueInput(false); setVenueSuggestions([]); }}
                className="p-0.5 text-white/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {venueSuggestions.length > 0 && (
              <div className="mt-1 ml-6 rounded-lg border border-white/10 bg-[#1a0f2e] overflow-hidden max-h-32 overflow-y-auto">
                {venueSuggestions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => selectVenueSuggestion(v)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 border-b border-white/5 last:border-b-0"
                  >
                    <MapPin className="h-3.5 w-3.5 text-[#d4ff00] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{v.name}</p>
                      <p className="text-white/40 text-xs truncate">{v.neighborhood}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowVenueInput(true)} className="w-full flex items-center gap-3 py-2.5">
            <MapPin className="h-4 w-4 text-white/60" />
            <span className={`flex-1 text-left text-sm ${location ? 'text-white' : 'text-white/40'}`}>
              {location || 'Add location'}
            </span>
            <ChevronRight className="h-4 w-4 text-white/20" />
          </button>
        )}

        <div className="border-t border-white/[0.06]" />

        {/* Audience row */}
        <button onClick={() => setShowAudienceSheet(true)} className="w-full flex items-center gap-3 py-2.5">
          <Users className="h-4 w-4 text-white/60" />
          <span className="flex-1 text-left text-sm text-white/40">Audience</span>
          <span className="text-white text-sm font-medium">{getVisibilityLabel()}</span>
          <ChevronRight className="h-4 w-4 text-white/20" />
        </button>
      </div>

      {/* Post button — pinned at bottom, always visible */}
      <div className="shrink-0 px-5 pt-2 mt-auto" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          type="button"
          onClick={handleShare}
          disabled={loading || !imageFile}
          className="w-full h-12 bg-[#d4ff00] text-black font-semibold text-base rounded-xl disabled:opacity-40 active:bg-[#d4ff00]/80 flex items-center justify-center"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Post'}
        </button>
      </div>

      {/* Audience Selection Sheet */}
      <Sheet open={showAudienceSheet} onOpenChange={setShowAudienceSheet}>
        <SheetContent side="bottom" className="bg-[#1a0a2e] border-white/10 rounded-t-2xl px-0 pb-8">
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
                  visibility === option.value ? 'bg-[#d4ff00]/10' : 'bg-white/5'
                }`}>
                  <option.icon className={`h-5 w-5 ${
                    visibility === option.value ? 'text-[#d4ff00]' : 'text-white/60'
                  }`} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-white">{option.label}</p>
                  <p className="text-xs text-white/40">{option.description}</p>
                </div>
                {visibility === option.value && (
                  <Check className="h-5 w-5 text-[#d4ff00]" />
                )}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
