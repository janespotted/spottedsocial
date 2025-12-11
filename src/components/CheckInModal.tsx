import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { MapPin, Edit3, Clock, Bell, X, AlarmClock, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { useIsMobile } from '@/hooks/use-mobile';
import { captureLocationWithVenue, createNewVenue, type LocationData } from '@/lib/location-service';
import { haptic } from '@/lib/haptics';
import { requestNotificationPermission } from '@/lib/notifications';
import { logEvent } from '@/lib/event-logger';
import { useUserCity } from '@/hooks/useUserCity';
import { CITY_NEIGHBORHOODS } from '@/lib/city-neighborhoods';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast as sonnerToast } from 'sonner';

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInModal({ open, onOpenChange }: CheckInModalProps) {
  const { user } = useAuth();
  const { isReminderTriggered } = useCheckIn();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { city } = useUserCity();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home' | 'planning'>('home');
  
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVenueConfirm, setShowVenueConfirm] = useState(false);
  const [showPlanningNeighborhood, setShowPlanningNeighborhood] = useState(false);
  const [showPlanningPrivacy, setShowPlanningPrivacy] = useState(false);
  const [planningNeighborhood, setPlanningNeighborhood] = useState<string>('');
  const [planningVisibility, setPlanningVisibility] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('all_friends');
  const [shareOption, setShareOption] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('close_friends');
  const [detectedVenue, setDetectedVenue] = useState<string>('');
  const [customVenue, setCustomVenue] = useState<string>('');
  const [isEditingVenue, setIsEditingVenue] = useState(false);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const locationIntervalRef = useRef<number | null>(null);
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [customReminderMinutes, setCustomReminderMinutes] = useState('');
  const [hasPendingReminder, setHasPendingReminder] = useState(false);
  const [pendingReminderTime, setPendingReminderTime] = useState<number | null>(null);

  // Check for pending reminder when modal opens
  useEffect(() => {
    if (open) {
      const reminderTime = localStorage.getItem('checkin_reminder');
      if (reminderTime) {
        setHasPendingReminder(true);
        setPendingReminderTime(Number(reminderTime));
      } else {
        setHasPendingReminder(false);
        setPendingReminderTime(null);
      }
    }
  }, [open]);

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

    // Update location every 60 seconds (reduced from 15s to lower DB load)
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
    }, 60000); // 60 seconds
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

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home' | 'planning') => {
    setSelectedStatus(status);

    if (status === 'out') {
      setShowShareModal(true);
    } else if (status === 'heading_out') {
      await captureAndDeriveVenue();
    } else if (status === 'planning') {
      // Show privacy selector first for planning mode
      setShowPlanningPrivacy(true);
    } else {
      await stopLocationTracking();
      await updateStatus(status, null, null, null);
      onOpenChange(false);
    }
  };

  const handlePlanningPrivacyConfirm = () => {
    setShowPlanningPrivacy(false);
    // Show neighborhood selector after privacy is set
    setPlanningNeighborhood('');
    setShowPlanningNeighborhood(true);
  };

  const handlePlanningConfirm = async (skipNeighborhood: boolean = false) => {
    const neighborhood = skipNeighborhood ? null : (planningNeighborhood || null);
    await updateStatus('planning', null, null, null, null, neighborhood, planningVisibility);
    setShowPlanningNeighborhood(false);
    onOpenChange(false);
  };

  const handleSetReminder = async (minutes: number) => {
    // Request notification permission
    await requestNotificationPermission();
    
    const reminderTime = Date.now() + minutes * 60 * 1000;
    localStorage.setItem('checkin_reminder', String(reminderTime));
    
    haptic.light();
    const label = minutes >= 60 ? `${minutes / 60} hr${minutes > 60 ? 's' : ''}` : `${minutes} mins`;
    sonnerToast.success(`We'll remind you in ${label}! ⏰`);
    onOpenChange(false);
  };

  const handleCancelReminder = () => {
    localStorage.removeItem('checkin_reminder');
    setHasPendingReminder(false);
    setPendingReminderTime(null);
    haptic.light();
    sonnerToast.success('Reminder cancelled');
  };

  const getRemainingTime = (): string => {
    if (!pendingReminderTime) return '';
    const remaining = pendingReminderTime - Date.now();
    if (remaining <= 0) return '';
    
    const mins = Math.ceil(remaining / 60000);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
    }
    return `${mins}m`;
  };

  const handleSnooze = (minutes: number) => {
    const snoozeTime = Date.now() + minutes * 60 * 1000;
    localStorage.setItem('checkin_reminder', String(snoozeTime));
    haptic.light();
    sonnerToast.success(`Snoozed for ${minutes} minutes! 😴`);
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
    status: 'out' | 'heading_out' | 'home' | 'planning',
    lat: number | null,
    lng: number | null,
    venue: string | null,
    venueId: string | null = null,
    neighborhood: string | null = null,
    visibility: 'close_friends' | 'all_friends' | 'mutual_friends' | null = null
  ) => {
    try {
      const statusData: any = {
        user_id: user?.id,
        status,
        lat,
        lng,
        venue_name: venue,
        venue_id: venueId,
        updated_at: new Date().toISOString(),
        expires_at: status === 'home' ? null : calculateExpiryTime(),
        planning_neighborhood: status === 'planning' ? neighborhood : null,
        planning_visibility: status === 'planning' ? visibility : null,
      };

      const { error } = await supabase
        .from('night_statuses')
        .upsert(statusData, { onConflict: 'user_id' });

      if (error) throw error;

      // Haptic feedback for successful check-in
      haptic.medium();

      if (status === 'out' && lat && lng && venue) {
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
        
        // Log location update
        logEvent('location_update', {
          venue_id: venueId,
          venue_name: venue,
          lat,
          lng,
          source: 'manual_checkin',
          status,
        });
      } else if (status === 'home' || status === 'planning') {
        // End all active check-ins when going home or planning
        await supabase
          .from('checkins')
          .update({ ended_at: new Date().toISOString() })
          .eq('user_id', user?.id)
          .is('ended_at', null);
        
        // For planning, also update profile to not show location
        if (status === 'planning') {
          await supabase
            .from('profiles')
            .update({ is_out: false })
            .eq('id', user?.id);
        }
      }

      const description = 
        status === 'home' ? "You won't appear on tonight's list." : 
        status === 'out' ? `You're out at ${venue}!` : 
        status === 'planning' ? "You're in planning mode — friends can see you're making plans to go out tonight." :
        `You're still deciding - heading to ${venue}!`;

      toast({
        title: 'Status updated!',
        description,
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
    <div className="flex flex-col items-center justify-between p-6 min-h-[600px] animate-scale-in">
      {/* Header */}
      <div className="w-full flex items-start justify-between pt-4">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
        <img 
          src={spottedLogo} 
          alt="Spotted" 
          className="h-10 w-10 object-contain drop-shadow-[0_0_10px_rgba(212,255,0,0.6)]" 
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <h2 className="text-4xl font-semibold text-[#d4ff00] text-center mb-12 tracking-wide drop-shadow-[0_0_15px_rgba(212,255,0,0.3)]">
          Are You Out?
        </h2>

        <div className="w-full space-y-6">
          {/* Yes - Primary yellow button with refined styling */}
          <Button
            onClick={() => {
              handleStatusUpdate('out');
            }}
            size="lg"
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-b from-[#f0ff80] via-[#e5ff4d] to-[#d4ff00] text-[#0a0118] hover:from-[#f5ffb3] hover:via-[#f0ff80] hover:to-[#e5ff4d] shadow-[0_0_20px_rgba(212,255,0,0.3)] hover:shadow-[0_0_25px_rgba(212,255,0,0.45)] transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            {isDetectingLocation && selectedStatus === 'out' ? 'Detecting location...' : 'Yes 🎉'}
          </Button>
          
          {/* Planning - Secondary purple button with gradient */}
          <Button
            onClick={() => {
              handleStatusUpdate('planning');
            }}
            size="lg"
            className="w-full h-14 text-lg font-medium rounded-2xl bg-gradient-to-b from-[#a855f7] to-[#9333ea] text-white border border-[#a855f7]/40 hover:from-[#b668f8] hover:to-[#a855f7] hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            Not yet, but planning on it 🎯
          </Button>
          
          {/* No - Tertiary glass button */}
          <Button
            onClick={() => {
              handleStatusUpdate('home');
            }}
            variant="ghost"
            size="lg"
            className="w-full h-14 text-lg font-medium rounded-2xl bg-white/5 backdrop-blur-sm border border-white/15 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/25 transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            No, staying in 🛋️
          </Button>
          
          {/* Still deciding - Glass button with dropdown */}
          {showCustomReminder ? (
            <div className="space-y-3">
              <Input
                type="number"
                value={customReminderMinutes}
                onChange={(e) => setCustomReminderMinutes(e.target.value)}
                placeholder="Enter minutes..."
                className="h-14 text-lg bg-white/5 backdrop-blur-sm border border-white/15 rounded-2xl text-white placeholder:text-white/40 focus:ring-white/30 focus:border-white/30"
                autoFocus
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => setShowCustomReminder(false)}
                  variant="ghost"
                  className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/15 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCustomReminderSubmit}
                  disabled={!customReminderMinutes || parseInt(customReminderMinutes, 10) <= 0}
                  className="flex-1 h-12 rounded-2xl bg-gradient-to-b from-[#f0ff80] to-[#d4ff00] text-[#0a0118] font-semibold hover:from-[#f5ffb3] hover:to-[#e5ff4d]"
                >
                  Set Reminder
                </Button>
              </div>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full h-14 text-lg font-medium rounded-2xl bg-white/5 backdrop-blur-sm border border-white/15 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/25 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={isDetectingLocation}
                >
                  {isDetectingLocation && selectedStatus === 'heading_out' ? 'Detecting location...' : (
                    <>
                      Still deciding… ⏰
                      <ChevronDown className="w-4 h-4 opacity-60" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="w-64 bg-[#1a0f2e]/95 backdrop-blur-xl border border-white/15 rounded-2xl z-[100] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                align="center"
                side="top"
                sideOffset={8}
              >
                {hasPendingReminder && (
                  <>
                    <DropdownMenuItem 
                      onClick={handleCancelReminder} 
                      className="text-red-400 hover:bg-red-500/10 cursor-pointer py-3 rounded-xl mx-1"
                    >
                      <X className="w-4 h-4 mr-3" /> Cancel ({getRemainingTime()} left)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10 my-1" />
                  </>
                )}
                <DropdownMenuLabel className="text-white/50 text-center py-2 text-sm">
                  Remind me in...
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10 my-1" />
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(15)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3 rounded-xl mx-1"
                >
                  <Clock className="w-4 h-4 mr-3 text-white/50" /> 15 min
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(60)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3 rounded-xl mx-1"
                >
                  <Clock className="w-4 h-4 mr-3 text-white/50" /> 1 hour
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleSetReminder(120)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3 rounded-xl mx-1"
                >
                  <Clock className="w-4 h-4 mr-3 text-white/50" /> 2 hours
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10 my-1" />
                <DropdownMenuItem 
                  onClick={() => setShowCustomReminder(true)} 
                  className="text-white hover:bg-white/10 cursor-pointer py-3 rounded-xl mx-1"
                >
                  <Edit3 className="w-4 h-4 mr-3 text-white/50" /> Custom...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>


        {/* Snooze options when reminder triggered */}
        {isReminderTriggered && (
          <div className="pt-6 space-y-3 w-full">
            <p className="text-white/60 text-center text-sm flex items-center justify-center gap-2">
              <AlarmClock className="w-4 h-4" />
              Need more time?
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => handleSnooze(15)}
                variant="outline"
                className="flex-1 h-12 rounded-2xl border border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Snooze 15m
              </Button>
              <Button
                onClick={() => handleSnooze(30)}
                variant="outline"
                className="flex-1 h-12 rounded-2xl border border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                Snooze 30m
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom spacer for balance */}
      <div className="h-8" />
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

  const PlanningNeighborhoodContent = () => {
    const neighborhoods = CITY_NEIGHBORHOODS[city] || CITY_NEIGHBORHOODS['la'];
    
    return (
      <div className="relative p-6 space-y-6">
        <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
        
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">Share what area you're thinking tonight?</h3>
          <p className="text-white/60 text-sm">(optional)</p>
          <div className="h-px bg-white/20" />
        </div>

        <div className="space-y-4">
          <Select value={planningNeighborhood} onValueChange={setPlanningNeighborhood}>
            <SelectTrigger className="h-14 text-lg bg-[#1a0f2e] border-2 border-[#a855f7]/50 text-white focus:ring-[#a855f7] focus:border-[#a855f7]">
              <SelectValue placeholder="Select neighborhood..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a0f2e] border-2 border-[#a855f7]/30 max-h-60 z-[600]">
              {neighborhoods.map((neighborhood) => (
                <SelectItem 
                  key={neighborhood} 
                  value={neighborhood}
                  className="text-white hover:bg-[#a855f7]/20 focus:bg-[#a855f7]/20 cursor-pointer"
                >
                  {neighborhood}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => handlePlanningConfirm(true)}
            variant="outline"
            className="flex-1 h-14 text-lg font-semibold rounded-full border-2 border-white/40 bg-transparent text-white hover:bg-white/10"
          >
            Skip
          </Button>
          <Button
            onClick={() => handlePlanningConfirm(false)}
            disabled={!planningNeighborhood}
            className="flex-1 h-14 text-lg font-semibold rounded-full bg-[#a855f7] text-white border-2 border-[#a855f7] hover:bg-[#a855f7]/80 shadow-[0_0_20px_rgba(168,85,247,0.4)] disabled:opacity-50"
          >
            Share
          </Button>
        </div>

        <p className="text-center text-sm text-white/60 italic">
          Friends will see you're planning tonight
        </p>
      </div>
    );
  };

  const PlanningPrivacyContent = () => (
    <div className="relative p-6 space-y-6">
      <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
      
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">Who can see you're planning to go out?</h3>
        <div className="h-px bg-white/20" />
      </div>

      <div className="space-y-4">
        <button
          onClick={() => setPlanningVisibility('close_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            planningVisibility === 'close_friends' ? 'border-[#a855f7]' : 'border-white/40'
          }`}>
            {planningVisibility === 'close_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#a855f7]" />
            )}
          </div>
          <span className="text-lg text-white">Close Friends 💛</span>
        </button>

        <button
          onClick={() => setPlanningVisibility('all_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            planningVisibility === 'all_friends' ? 'border-[#a855f7]' : 'border-white/40'
          }`}>
            {planningVisibility === 'all_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#a855f7]" />
            )}
          </div>
          <span className="text-lg text-white">All Friends 👫</span>
        </button>

        <button
          onClick={() => setPlanningVisibility('mutual_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            planningVisibility === 'mutual_friends' ? 'border-[#a855f7]' : 'border-white/40'
          }`}>
            {planningVisibility === 'mutual_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#a855f7]" />
            )}
          </div>
          <span className="text-lg text-white">Mutual Friends 🔗</span>
        </button>
      </div>

      <Button
        onClick={handlePlanningPrivacyConfirm}
        className="w-full h-14 text-lg font-semibold rounded-full bg-[#a855f7] text-white border-2 border-[#a855f7] hover:bg-[#a855f7]/80 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
      >
        Confirm
      </Button>

      <p className="text-center text-sm text-white/60 italic">
        Your plan visibility resets at 5am
      </p>
    </div>
  );

  return (
    <>
      {/* Status Modal */}
      {isMobile ? (
        <Drawer open={open && !showShareModal && !showVenueConfirm && !showPlanningNeighborhood && !showPlanningPrivacy} onOpenChange={onOpenChange}>
          <DrawerContent className="bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-0 border-t-2 border-[#a855f7]/30 shadow-[0_-20px_60px_rgba(168,85,247,0.4)]">
            <StatusContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open && !showShareModal && !showVenueConfirm && !showPlanningNeighborhood && !showPlanningPrivacy} onOpenChange={onOpenChange}>
          <DialogContent className="bg-gradient-to-b from-[#2d1b4e] via-[#1a0f2e] to-[#0a0118] border-2 border-[#a855f7]/40 shadow-[0_0_80px_rgba(168,85,247,0.5),0_0_40px_rgba(139,92,246,0.4)] max-w-md p-0 overflow-hidden rounded-3xl">
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

      {/* Planning Privacy Modal */}
      {isMobile ? (
        <Drawer open={showPlanningPrivacy} onOpenChange={setShowPlanningPrivacy}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <PlanningPrivacyContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showPlanningPrivacy} onOpenChange={setShowPlanningPrivacy}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden">
            <PlanningPrivacyContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Planning Neighborhood Modal */}
      {isMobile ? (
        <Drawer open={showPlanningNeighborhood} onOpenChange={setShowPlanningNeighborhood}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <PlanningNeighborhoodContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showPlanningNeighborhood} onOpenChange={setShowPlanningNeighborhood}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden">
            <PlanningNeighborhoodContent />
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
