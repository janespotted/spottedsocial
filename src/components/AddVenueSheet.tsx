import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { reportVenueLocation } from '@/lib/location-detection-logger';
import { getCurrentLocation } from '@/lib/location-service';
import { haptic } from '@/lib/haptics';
import { checkAndRecordRateLimit, getRateLimitMessage } from '@/lib/rate-limit';

interface AddVenueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userLat?: number;
  userLng?: number;
  onVenueAdded?: () => void;
}

export function AddVenueSheet({
  open,
  onOpenChange,
  userLat,
  userLng,
  onVenueAdded,
}: AddVenueSheetProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'bar' | 'club' | 'lounge'>('bar');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    userLat && userLng ? { lat: userLat, lng: userLng } : null
  );

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    try {
      const coords = await getCurrentLocation();
      setLocation({ lat: coords.lat, lng: coords.lng });
      toast.success('Location captured!');
    } catch (error) {
      toast.error('Could not get your location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a venue name');
      return;
    }

    if (!location) {
      toast.error('Please capture your location first');
      return;
    }

    // Check rate limit first
    const allowed = await checkAndRecordRateLimit('new_venue');
    if (!allowed) {
      toast.error(getRateLimitMessage('new_venue'));
      return;
    }

    setIsSubmitting(true);
    haptic.light();

    try {
      const success = await reportVenueLocation({
        venueId: null,
        reportType: 'new_venue',
        reportedLat: location.lat,
        reportedLng: location.lng,
        userLat: location.lat,
        userLng: location.lng,
        suggestedVenueName: name.trim(),
        suggestedVenueType: type,
      });

      if (success) {
        haptic.success();
        toast.success('Venue submitted for review!', {
          description: 'We\'ll add it once verified.',
        });
        onOpenChange(false);
        onVenueAdded?.();
        // Reset form
        setName('');
        setType('bar');
        setLocation(null);
      } else {
        throw new Error('Failed to submit');
      }
    } catch (error) {
      toast.error('Failed to submit venue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-gradient-to-b from-[#2d1b4e] to-[#1a0f2e] border-t border-[#a855f7]/40 rounded-t-3xl"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white text-xl">Add New Venue</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Venue Name */}
          <div className="space-y-2">
            <Label className="text-white/80">Venue Name</Label>
            <Input
              placeholder="e.g., The Rooftop Bar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
            />
          </div>

          {/* Venue Type */}
          <div className="space-y-2">
            <Label className="text-white/80">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a0f2e] border-[#a855f7]/40">
                <SelectItem value="bar" className="text-white hover:bg-[#a855f7]/20">
                  Bar
                </SelectItem>
                <SelectItem value="club" className="text-white hover:bg-[#a855f7]/20">
                  Club
                </SelectItem>
                <SelectItem value="lounge" className="text-white hover:bg-[#a855f7]/20">
                  Lounge
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="text-white/80">Location</Label>
            <Button
              variant="outline"
              onClick={handleGetLocation}
              disabled={isGettingLocation}
              className="w-full h-12 border-white/20 text-white hover:bg-white/10"
            >
              {isGettingLocation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Getting location...
                </>
              ) : location ? (
                <>
                  <MapPin className="h-4 w-4 mr-2 text-green-400" />
                  Location captured ✓
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-2" />
                  Capture my current location
                </>
              )}
            </Button>
            {location && (
              <p className="text-white/40 text-xs text-center">
                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !location}
            className="w-full h-12 mt-4 bg-gradient-to-r from-[#c4ee00] to-[#d4ff00] text-black font-semibold hover:opacity-90"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Venue'
            )}
          </Button>

          <p className="text-white/40 text-xs text-center">
            Submitted venues are reviewed before being added
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
