import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogOverlay, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, X, Navigation } from 'lucide-react';
import { useCheckIn, DetectedVenue } from '@/contexts/CheckInContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { dismissVenuePrompt } from '@/lib/venue-arrival-nudge';
import { haptic } from '@/lib/haptics';
import { logVenueConfirmation, logVenueDismissal } from '@/lib/location-detection-logger';
import { VenueCorrectionSheet } from '@/components/VenueCorrectionSheet';
import { AddVenueSheet } from '@/components/AddVenueSheet';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

export function VenueArrivalPrompt() {
  const { user } = useAuth();
  const { showVenueArrivalPrompt, hideVenueArrival, detectedVenue, nearbyVenues, showOutConfirmation } = useCheckIn();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<DetectedVenue | null>(null);
  const [showCorrectionSheet, setShowCorrectionSheet] = useState(false);
  const [showAddVenueSheet, setShowAddVenueSheet] = useState(false);

  // Initialize selected venue when detected venue changes
  useEffect(() => {
    if (detectedVenue) {
      setSelectedVenue(detectedVenue);
    }
  }, [detectedVenue]);

  const handleVenueChange = (venueId: string) => {
    const venue = nearbyVenues.find(v => v.id === venueId);
    if (venue) {
      setSelectedVenue(venue);
      haptic.light();
    }
  };

  const handleConfirm = async () => {
    if (!user?.id || !selectedVenue) return;
    
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
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name,
          lat: selectedVenue.lat,
          lng: selectedVenue.lng,
          started_at: now,
        });

      // Update night status to 'out'
      await supabase
        .from('night_statuses')
        .upsert({
          user_id: user.id,
          status: 'out',
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name,
          lat: selectedVenue.lat,
          lng: selectedVenue.lng,
          expires_at: expiresAt.toISOString(),
          updated_at: now,
        }, { onConflict: 'user_id' });

      // Update profile location
      await supabase
        .from('profiles')
        .update({
          is_out: true,
          last_known_lat: selectedVenue.lat,
          last_known_lng: selectedVenue.lng,
          last_location_at: now,
        })
        .eq('id', user.id);

      hideVenueArrival();
      // Log confirmation analytics
      if (detectedVenue) {
        const wasCorrect = detectedVenue.id === selectedVenue.id;
        logVenueConfirmation(detectedVenue.id, selectedVenue.id, wasCorrect);
      }
      
      // Show confirmation with buzz prompt - get privacy level from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('location_sharing_level')
        .eq('id', user.id)
        .single();
      
      const privacyLevel = profile?.location_sharing_level || 'all_friends';
      showOutConfirmation(selectedVenue.name, selectedVenue.id, privacyLevel);
    } catch (error) {
      console.error('Error confirming arrival:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDismiss = () => {
    if (detectedVenue) {
      dismissVenuePrompt(detectedVenue.id);
      logVenueDismissal(detectedVenue.id, 'user_dismissed');
    }
    haptic.light();
    hideVenueArrival();
  };

  const handleSelectCorrectedVenue = (venue: { id: string; name: string; distance: number }) => {
    setSelectedVenue({
      id: venue.id,
      name: venue.name,
      lat: 0, // Will be fetched from DB on confirm
      lng: 0,
      distance: venue.distance,
    });
    haptic.light();
  };

  if (!selectedVenue) return null;

  // Filter other venues (exclude the currently selected one)
  const otherVenues = nearbyVenues.filter(v => v.id !== selectedVenue.id);

  return (
    <Dialog open={showVenueArrivalPrompt} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogOverlay className="bg-black/80 backdrop-blur-sm z-[500]" />
      <DialogContent className="max-w-[380px] bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-2 border-[#a855f7]/40 rounded-3xl p-0 overflow-hidden z-[500]" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Venue Arrival</DialogTitle>
        </VisuallyHidden>
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

          {/* Single clear question with venue name */}
          <h2 className="text-2xl font-bold text-white mb-2">
            You're near {selectedVenue.name}.<br />Are you out?
          </h2>

          {/* Venue selector dropdown - only show if there are other venues */}
          {otherVenues.length > 0 && (
            <div className="mb-6 mt-4">
              <p className="text-sm text-white/50 mb-2">Not right? Select another:</p>
              <Select value={selectedVenue.id} onValueChange={handleVenueChange}>
                <SelectTrigger className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20 focus:ring-[#a855f7]/50">
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#a855f7]" />
                      {selectedVenue.name}
                      {selectedVenue.distance && (
                        <span className="text-white/50 text-xs">
                          ({Math.round(selectedVenue.distance)}m)
                        </span>
                      )}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-[#1a0f2e] border-[#a855f7]/40 z-[600]">
                  {nearbyVenues.map(venue => (
                    <SelectItem 
                      key={venue.id} 
                      value={venue.id}
                      className="text-white hover:bg-[#a855f7]/20 focus:bg-[#a855f7]/20 focus:text-white cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {venue.name}
                        {venue.distance && (
                          <span className="text-white/50 text-xs">
                            ({Math.round(venue.distance)}m)
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Confirm button */}
          <Button
            onClick={handleConfirm}
            disabled={isConfirming}
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-[#c4ee00] to-[#d4ff00] text-black hover:opacity-90 transition-all shadow-[0_0_20px_rgba(212,255,0,0.3)] mb-3"
          >
            {isConfirming ? 'Updating...' : "Yes, I'm here! 🎉"}
          </Button>

          {/* I'm somewhere else button */}
          <button
            onClick={() => {
              haptic.light();
              setShowCorrectionSheet(true);
            }}
            className="flex items-center justify-center gap-1 text-[#a855f7] hover:text-[#c084fc] text-sm transition-colors mb-2"
          >
            <Navigation className="h-3.5 w-3.5" />
            I'm somewhere else
          </button>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="text-white/50 hover:text-white/80 text-sm transition-colors"
          >
            Not yet • Dismiss
          </button>
        </div>
      </DialogContent>

      {/* Venue Correction Sheet */}
      <VenueCorrectionSheet
        open={showCorrectionSheet}
        onOpenChange={setShowCorrectionSheet}
        nearbyVenues={nearbyVenues.map(v => ({ id: v.id, name: v.name, distance: v.distance || 0 }))}
        onSelectVenue={handleSelectCorrectedVenue}
        onAddNewVenue={() => setShowAddVenueSheet(true)}
        currentVenueId={selectedVenue?.id}
      />

      {/* Add Venue Sheet */}
      <AddVenueSheet
        open={showAddVenueSheet}
        onOpenChange={setShowAddVenueSheet}
      />
    </Dialog>
  );
}
