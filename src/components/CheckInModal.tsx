import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Ghost, MapPin, Edit3, Clock, Bell } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { useIsMobile } from '@/hooks/use-mobile';
import { captureLocationWithVenue, createNewVenue, type LocationData } from '@/lib/location-service';
import { haptic } from '@/lib/haptics';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast as sonnerToast } from 'sonner';

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInModal({ open, onOpenChange }: CheckInModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home'>('home');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVenueConfirm, setShowVenueConfirm] = useState(false);
  const [shareOption, setShareOption] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('close_friends');
  const [detectedVenue, setDetectedVenue] = useState<string>('');
  const [customVenue, setCustomVenue] = useState<string>('');
  const [isEditingVenue, setIsEditingVenue] = useState(false);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const locationIntervalRef = useRef<number | null>(null);
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [customReminderMinutes, setCustomReminderMinutes] = useState('');

  // Load current location sharing level from profile
  useEffect(() => {
    const loadLocationSharingLevel = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('location_sharing_level')
        .eq('id', user.id)
        .single();
      
      if (data?.location_sharing_level) {
        setShareOption(data.location_sharing_level as 'close_friends' | 'all_friends' | 'mutual_friends');
      }
    };
    
    if (open) {
      loadLocationSharingLevel();
    }
  }, [user, open]);

  // Clean up location interval on unmount
  useEffect(() => {
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, []);

  const startLocationTracking = (initialLat: number, initialLng: number) => {
    // Clear any existing interval
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    // Update location every 15 seconds
    locationIntervalRef.current = window.setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            await supabase
              .from('profiles')
              .update({ 
                last_known_lat: lat,
                last_known_lng: lng,
                last_location_at: new Date().toISOString()
              })
              .eq('id', user?.id);
          },
          (error) => {
            console.error('Location update error:', error);
          }
        );
      }
    }, 15000); // 15 seconds
  };

  const stopLocationTracking = async () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    await supabase
      .from('profiles')
      .update({ 
        is_out: false,
        last_known_lat: null,
        last_known_lng: null,
        last_location_at: null
      })
      .eq('id', user?.id);
  };

  const calculateExpiryTime = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
    return tomorrow.toISOString();
  };

  // Capture location and derive venue using location service
  const captureAndDeriveVenue = async () => {
    setIsDetectingLocation(true);
    try {
      const locData = await captureLocationWithVenue();
      setLocationData(locData);
      
      if (locData.venueName && locData.venueId) {
        // Found a venue
        setDetectedVenue(locData.venueName);
        setCustomVenue(locData.venueName);
        setShowVenueConfirm(true);
      } else {
        // No venue found - prompt for manual entry
        setDetectedVenue('');
        setCustomVenue('');
        setIsEditingVenue(true);
        setShowVenueConfirm(true);
      }
    } catch (error) {
      console.error('Error capturing location:', error);
      toast({
        variant: 'destructive',
        title: 'Location error',
        description: 'Could not get your location. Please try again.',
      });
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home') => {
    setSelectedStatus(status);

    if (status === 'out') {
      setShowShareModal(true);
    } else if (status === 'heading_out') {
      await captureAndDeriveVenue();
    } else {
      await stopLocationTracking();
      await updateStatus(status, null, null, null);
      onOpenChange(false);
    }
  };

  const handleSetReminder = (minutes: number) => {
    const reminderTime = Date.now() + minutes * 60 * 1000;
    localStorage.setItem('checkin_reminder', String(reminderTime));
    
    haptic.light();
    const label = minutes >= 60 ? `${minutes / 60} hr${minutes > 60 ? 's' : ''}` : `${minutes} mins`;
    sonnerToast.success(`We'll remind you in ${label}! ⏰`);
    onOpenChange(false);
  };

  const handleCustomReminderSubmit = () => {
    const mins = parseInt(customReminderMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      handleSetReminder(mins);
      setShowCustomReminder(false);
      setCustomReminderMinutes('');
    }
  };

  const handleShareLocation = async () => {
    setShowShareModal(false);
    setIsDetectingLocation(true);

    if ('geolocation' in navigator) {
      captureAndDeriveVenue().catch((error) => {
        setIsDetectingLocation(false);
        toast({
          variant: 'destructive',
          title: 'Turn on location to share where you are',
          description: 'Location permission is required to share your location.',
        });
      });
    }
  };

  const handleVenueConfirm = async () => {
    if (!locationData) {
      toast({
        variant: 'destructive',
        title: 'Location data missing',
        description: 'Please try capturing location again',
      });
      return;
    }

    let finalVenueId = locationData.venueId;
    let finalVenueName = customVenue.trim() || locationData.venueName;

    // If user entered custom venue and no venue ID, create new venue
    if (!finalVenueId && customVenue.trim()) {
      const newVenueId = await createNewVenue(
        customVenue.trim(),
        locationData.lat,
        locationData.lng,
        'Unknown',
        'bar'
      );
      
      if (newVenueId) {
        finalVenueId = newVenueId;
        toast({
          title: 'Venue created',
          description: `${customVenue.trim()} has been added!`,
        });
      }
    }

    if (!finalVenueName) {
      toast({
        variant: 'destructive',
        title: 'Venue required',
        description: 'Please enter a venue name',
      });
      return;
    }

    setShowVenueConfirm(false);

    if (selectedStatus === 'out') {
      // Save all location data to profile
      try {
        await supabase
          .from('profiles')
          .update({ 
            is_out: true,
            location_sharing_level: shareOption,
            last_known_lat: locationData.lat,
            last_known_lng: locationData.lng,
            last_location_at: locationData.timestamp
          })
          .eq('id', user?.id);

        // Start tracking location updates
        startLocationTracking(locationData.lat, locationData.lng);

        await updateStatus('out', locationData.lat, locationData.lng, finalVenueName, finalVenueId);
        onOpenChange(false);

        toast({
          title: 'Location sharing enabled',
          description: `You're out at ${finalVenueName}!`,
        });
      } catch (error) {
        console.error('Error updating location sharing:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to enable location sharing',
        });
      }
    } else if (selectedStatus === 'heading_out') {
      await updateStatus('heading_out', locationData.lat, locationData.lng, finalVenueName, finalVenueId);
      onOpenChange(false);
    }
  };

  const updateStatus = async (
    status: 'out' | 'heading_out' | 'home',
    lat: number | null,
    lng: number | null,
    venue: string | null,
    venueId: string | null = null
  ) => {
    try {
      const statusData = {
        user_id: user?.id,
        status,
        lat,
        lng,
        venue_name: venue,
        venue_id: venueId,
        updated_at: new Date().toISOString(),
        expires_at: status === 'home' ? null : calculateExpiryTime(),
      };

      const { error } = await supabase
        .from('night_statuses')
        .upsert(statusData, { onConflict: 'user_id' });

      if (error) throw error;

      // Haptic feedback for successful check-in
      haptic.medium();

      if (status !== 'home' && lat && lng && venue) {
        // End any active check-ins before creating a new one
        await supabase
          .from('checkins')
          .update({ ended_at: new Date().toISOString() })
          .eq('user_id', user?.id)
          .is('ended_at', null);

        // Create new check-in with tracking fields
        await supabase.from('checkins').insert({
          user_id: user?.id,
          venue_name: venue,
          venue_id: venueId,
          lat,
          lng,
          started_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        });
      } else if (status === 'home') {
        // End all active check-ins when going home
        await supabase
          .from('checkins')
          .update({ ended_at: new Date().toISOString() })
          .eq('user_id', user?.id)
          .is('ended_at', null);
      }

      toast({
        title: 'Status updated!',
        description: status === 'home' ? "You're staying in." : status === 'out' ? `You're out at ${venue}!` : `You're still deciding - heading to ${venue}!`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const StatusContent = () => (
    <div className="flex flex-col items-center justify-between p-6 min-h-[600px]">
      {/* Header */}
      <div className="w-full flex items-start justify-between pt-4">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
        <img src={spottedLogo} alt="Spotted" className="h-10 w-10 object-contain" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-12 w-full">
        <h2 className="text-5xl font-bold text-[#d4ff00] text-center leading-tight">
          Are You<br />Out?
        </h2>

        <div className="w-full space-y-4">
          <Button
            onClick={() => handleStatusUpdate('out')}
            variant="outline"
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            {isDetectingLocation && selectedStatus === 'out' ? 'Detecting location...' : 'Yes'}
          </Button>
          <Button
            onClick={() => handleStatusUpdate('home')}
            variant="outline"
            size="lg"
            className="w-full h-16 text-xl font-semibold rounded-full border-2 border-[#d4ff00] bg-transparent text-[#d4ff00] hover:bg-[#d4ff00]/10 hover:text-[#d4ff00] shadow-[0_0_20px_rgba(212,255,0,0.3)] disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            No
          </Button>
          {showCustomReminder ? (
            <div className="space-y-3">
              <Input
                type="number"
                value={customReminderMinutes}
                onChange={(e) => setCustomReminderMinutes(e.target.value)}
                placeholder="Enter minutes..."
                className="h-14 text-lg bg-[#1a0f2e] border-2 border-white text-white placeholder:text-white/40 focus:ring-white"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCustomReminder(false)}
                  variant="outline"
                  className="flex-1 h-12 rounded-full border-2 border-white/40 bg-transparent text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCustomReminderSubmit}
                  disabled={!customReminderMinutes || parseInt(customReminderMinutes, 10) <= 0}
                  className="flex-1 h-12 rounded-full bg-[#d4ff00] text-[#2d1b4e] font-semibold hover:bg-[#d4ff00]/90"
                >
                  Set Reminder
                </Button>
              </div>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full h-16 text-xl font-semibold rounded-full border-2 border-white bg-transparent text-white hover:bg-white/10 hover:text-white shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50"
                  disabled={isDetectingLocation}
                >
                  {isDetectingLocation && selectedStatus === 'heading_out' ? 'Detecting location...' : 'Still Deciding...'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="w-72 bg-[#1a0f2e] border-2 border-white/20 rounded-xl z-[100]"
                align="center"
                side="top"
                sideOffset={8}
              >
                <DropdownMenuLabel className="text-white/60 text-center py-3">
                  <Bell className="inline w-4 h-4 mr-2" />
                  Remind me to share if I'm out
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(30)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3"
                >
                  <Clock className="w-4 h-4 mr-3 text-[#d4ff00]" /> In 30 minutes
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(60)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3"
                >
                  <Clock className="w-4 h-4 mr-3 text-[#d4ff00]" /> In 1 hour
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(120)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3"
                >
                  <Clock className="w-4 h-4 mr-3 text-[#d4ff00]" /> In 2 hours
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem 
                  onClick={() => setShowCustomReminder(true)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3"
                >
                  <Edit3 className="w-4 h-4 mr-3 text-[#d4ff00]" /> Custom time...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Ghost Icon */}
      <div className="w-full flex justify-end">
        <Ghost className="h-8 w-8 text-white/60" />
      </div>
    </div>
  );

  const ShareLocationContent = () => (
    <div className="relative p-6 space-y-6">
      <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
      
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">Share Your Location With:</h3>
        <div className="h-px bg-white/20" />
      </div>

      <div className="space-y-4">
        <button
          onClick={() => setShareOption('close_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            shareOption === 'close_friends' ? 'border-[#d4ff00]' : 'border-white/40'
          }`}>
            {shareOption === 'close_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
            )}
          </div>
          <span className="text-lg text-white">Close Friends 💛</span>
        </button>

        <button
          onClick={() => setShareOption('all_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            shareOption === 'all_friends' ? 'border-[#d4ff00]' : 'border-white/40'
          }`}>
            {shareOption === 'all_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
            )}
          </div>
          <span className="text-lg text-white">All Friends 👫</span>
        </button>

        <button
          onClick={() => setShareOption('mutual_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            shareOption === 'mutual_friends' ? 'border-[#d4ff00]' : 'border-white/40'
          }`}>
            {shareOption === 'mutual_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#d4ff00]" />
            )}
          </div>
          <span className="text-lg text-white">Mutual Friends 🔗</span>
        </button>
      </div>

      <Button
        onClick={handleShareLocation}
        className="w-full h-14 text-lg font-semibold rounded-full bg-[#5b21b6] text-[#d4ff00] border-2 border-[#d4ff00] hover:bg-[#6d28d9] shadow-[0_0_20px_rgba(212,255,0,0.4)]"
      >
        Share Location
      </Button>

      <p className="text-center text-sm text-white/60 italic">
        Location stops sharing at 5am
      </p>
    </div>
  );

  const VenueConfirmContent = () => (
    <div className="relative p-6 space-y-6">
      <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
      
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">
          {detectedVenue ? 'Confirm Your Location' : 'Where Are You?'}
        </h3>
        <div className="h-px bg-white/20" />
      </div>

      {detectedVenue && !isEditingVenue ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-[#5b21b6]/20 border-2 border-[#d4ff00] rounded-xl">
            <MapPin className="h-6 w-6 text-[#d4ff00]" />
            <span className="text-lg text-white font-medium flex-1">{detectedVenue}</span>
            <button
              onClick={() => setIsEditingVenue(true)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <Edit3 className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-white/60 text-center">
            We detected you're near this venue
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            value={customVenue}
            onChange={(e) => setCustomVenue(e.target.value)}
            placeholder={detectedVenue ? "Enter different venue..." : "Enter venue name..."}
            className="h-14 text-lg bg-[#1a0f2e] border-2 border-[#d4ff00] text-white placeholder:text-white/40 focus:ring-[#d4ff00]"
            autoFocus
          />
          {detectedVenue && (
            <button
              onClick={() => {
                setCustomVenue(detectedVenue);
                setIsEditingVenue(false);
              }}
              className="text-sm text-[#d4ff00] hover:underline"
            >
              Use detected venue: {detectedVenue}
            </button>
          )}
          {!detectedVenue && (
            <p className="text-sm text-white/60 text-center">
              No nearby venues found. Enter manually.
            </p>
          )}
        </div>
      )}

      <Button
        onClick={handleVenueConfirm}
        disabled={!customVenue.trim()}
        className="w-full h-14 text-lg font-semibold rounded-full bg-[#5b21b6] text-[#d4ff00] border-2 border-[#d4ff00] hover:bg-[#6d28d9] shadow-[0_0_20px_rgba(212,255,0,0.4)] disabled:opacity-50"
      >
        Confirm
      </Button>
    </div>
  );

  return (
    <>
      {/* Status Modal */}
      {isMobile ? (
        <Drawer open={open && !showShareModal && !showVenueConfirm} onOpenChange={onOpenChange}>
          <DrawerContent className="bg-gradient-to-b from-[#3d2b5f] via-[#2a1f4a] to-black border-0">
            <StatusContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open && !showShareModal && !showVenueConfirm} onOpenChange={onOpenChange}>
          <DialogContent className="bg-gradient-to-b from-[#3d2b5f] via-[#2a1f4a] to-black border-0 shadow-[0_0_60px_rgba(147,51,234,0.8)] max-w-md p-0 overflow-hidden">
            <StatusContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Share Location Modal */}
      {isMobile ? (
        <Drawer open={showShareModal} onOpenChange={setShowShareModal}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <ShareLocationContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden">
            <ShareLocationContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Venue Confirmation Modal */}
      {isMobile ? (
        <Drawer open={showVenueConfirm} onOpenChange={setShowVenueConfirm}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <VenueConfirmContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showVenueConfirm} onOpenChange={setShowVenueConfirm}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden">
            <VenueConfirmContent />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
