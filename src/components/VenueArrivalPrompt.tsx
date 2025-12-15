import { useState } from 'react';
import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, X } from 'lucide-react';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { dismissVenuePrompt } from '@/lib/venue-arrival-nudge';
import { haptic } from '@/lib/haptics';

export function VenueArrivalPrompt() {
  const { user } = useAuth();
  const { showVenueArrivalPrompt, hideVenueArrival, detectedVenue } = useCheckIn();
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!user?.id || !detectedVenue) return;
    
    setIsConfirming(true);
    haptic.success();

    try {
      const now = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setHours(5, 0, 0, 0);
      if (expiresAt <= new Date()) {
        expiresAt.setDate(expiresAt.getDate() + 1);
      }

      // End any existing check-ins
      await supabase
        .from('checkins')
        .update({ ended_at: now })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // Create new check-in
      await supabase
        .from('checkins')
        .insert({
          user_id: user.id,
          venue_id: detectedVenue.id,
          venue_name: detectedVenue.name,
          lat: detectedVenue.lat,
          lng: detectedVenue.lng,
          started_at: now,
        });

      // Update night status to 'out'
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'out',
          venue_id: detectedVenue.id,
          venue_name: detectedVenue.name,
          lat: detectedVenue.lat,
          lng: detectedVenue.lng,
          expires_at: expiresAt.toISOString(),
          updated_at: now,
        }, { onConflict: 'user_id' });

      // Update profile location
      await supabase
        .from('profiles')
        .update({
          is_out: true,
          last_known_lat: detectedVenue.lat,
          last_known_lng: detectedVenue.lng,
          last_location_at: now,
        })
        .eq('id', user.id);

      hideVenueArrival();
      toast.success(`You're out at ${detectedVenue.name}! 🎉`);
    } catch (error) {
      console.error('Error confirming arrival:', error);
      toast.error('Failed to update status');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDismiss = () => {
    if (detectedVenue) {
      dismissVenuePrompt(detectedVenue.id);
    }
    haptic.light();
    hideVenueArrival();
  };

  if (!detectedVenue) return null;

  return (
    <Dialog open={showVenueArrivalPrompt} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogOverlay className="bg-black/80 backdrop-blur-sm z-[500]" />
      <DialogContent className="max-w-[380px] bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl p-0 overflow-hidden z-[500]">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Location icon with glow */}
          <div className="mx-auto w-16 h-16 rounded-full bg-[#a855f7]/20 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
            <MapPin className="h-8 w-8 text-[#a855f7]" />
          </div>

          {/* Title */}
          <p className="text-white/70 text-sm mb-1">You're near</p>
          <h2 className="text-2xl font-bold text-white mb-6">{detectedVenue.name}</h2>

          {/* Question */}
          <p className="text-white/80 mb-6">Want to share you're out?</p>

          {/* Confirm button */}
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-[#c4ee00] to-[#d4ff00] text-black hover:opacity-90 transition-all shadow-[0_0_20px_rgba(212,255,0,0.3)] mb-3"
          >
            {isConfirming ? 'Updating...' : "Yes, I'm here! 🎉"}
          </Button>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="text-white/50 hover:text-white/80 text-sm transition-colors"
          >
            Not yet • Dismiss
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
