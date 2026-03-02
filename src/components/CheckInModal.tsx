import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { MapPin, Edit3, Clock, Bell, X, AlarmClock, ChevronDown, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import spottedLogo from '@/assets/spotted-s-logo.png';
import { useIsMobile } from '@/hooks/use-mobile';
import { captureLocationWithVenue, createNewVenue, detectNeighborhoodFromGPS, getCurrentLocation, type LocationData } from '@/lib/location-service';

import { haptic } from '@/lib/haptics';
import { requestNotificationPermission } from '@/lib/notifications';
import { logEvent } from '@/lib/event-logger';
import { markManualCheckin } from '@/lib/auto-venue-tracker';
import { getDemoMode } from '@/lib/demo-data';
import { getCachedCity } from '@/lib/city-detection';
import { useUserCity } from '@/hooks/useUserCity';
import { CITY_NEIGHBORHOODS } from '@/lib/city-neighborhoods';
import { useKeyboardAware } from '@/hooks/useKeyboardAware';
import { PrivatePartyInviteModal } from '@/components/PrivatePartyInviteModal';
import { LocationPermissionPrompt } from '@/components/LocationPermissionPrompt';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
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
  const { isReminderTriggered, showOutConfirmation, showPlanningConfirmation } = useCheckIn();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { city, refreshCity, isLoading: isDetectingCity } = useUserCity();
  const { handleInputFocus } = useKeyboardAware();
  const [selectedStatus, setSelectedStatus] = useState<'out' | 'heading_out' | 'home' | 'planning' | 'private_party'>('home');
  
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [locationErrorType, setLocationErrorType] = useState<'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported'>('permission_denied');
  const [showVenueConfirm, setShowVenueConfirm] = useState(false);
  const [showPlanningNeighborhood, setShowPlanningNeighborhood] = useState(false);
  const [showPlanningPrivacy, setShowPlanningPrivacy] = useState(false);
  const [planningNeighborhood, setPlanningNeighborhood] = useState<string | undefined>(undefined);
  const [planningVisibility, setPlanningVisibility] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('all_friends');
  const [shareOption, setShareOption] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('close_friends');
  const [detectedVenue, setDetectedVenue] = useState<string>('');
  const [customVenue, setCustomVenue] = useState<string>('');
  const [isEditingVenue, setIsEditingVenue] = useState(false);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const locationIntervalRef = useRef<number | null>(null);
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [customReminderMinutes, setCustomReminderMinutes] = useState('');
  const [hasPendingReminder, setHasPendingReminder] = useState(false);
  const [pendingReminderTime, setPendingReminderTime] = useState<number | null>(null);

  // Private party state
  const [showPrivatePartyNeighborhood, setShowPrivatePartyNeighborhood] = useState(false);
  const [showPrivatePartyPrivacy, setShowPrivatePartyPrivacy] = useState(false);
  const [showPrivatePartyInvite, setShowPrivatePartyInvite] = useState(false);
  const [privatePartyNeighborhood, setPrivatePartyNeighborhood] = useState<string | undefined>(undefined);
  const [privatePartyAddress, setPrivatePartyAddress] = useState<string>('');
  const [privatePartyVisibility, setPrivatePartyVisibility] = useState<'close_friends' | 'all_friends' | 'mutual_friends'>('close_friends');
  const [isDetectingNeighborhood, setIsDetectingNeighborhood] = useState(false);
  const [showNeighborhoodManualSelect, setShowNeighborhoodManualSelect] = useState(false);

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
      // Demo mode: log it but still use real GPS for venue detection
      const demoMode = getDemoMode();
      if (demoMode.enabled) {
        console.log('[Demo] Using real GPS for venue detection');
      }

      const locData = await captureLocationWithVenue(demoMode.enabled ? 200 : undefined);
      console.log('=== VENUE DEBUG ===');
      console.log('GPS coords:', locData.lat, locData.lng);
      console.log('GPS accuracy:', locData.accuracy);
      console.log('Nearby venues returned:', JSON.stringify(locData.nearbyVenues));
      console.log('Selected venue:', locData.venueName, locData.venueId);
      setLocationData(locData);
      
      if (locData.venueName && locData.venueId) {
        // Found a venue
        setDetectedVenue(locData.venueName);
        setCustomVenue(locData.venueName);
        setSelectedVenueId(locData.venueId);
        setShowVenueConfirm(true);
      } else {
        // No venue found - prompt for manual entry
        setDetectedVenue('');
        setCustomVenue('');
        setSelectedVenueId(null);
        setIsEditingVenue(true);
        setShowVenueConfirm(true);
      }
    } catch (error: any) {
      console.error('Error capturing location:', error);
      
      // Check for permission denied (GeolocationPositionError code 1)
      if (error?.code === 1) {
        setLocationErrorType('permission_denied');
        setShowLocationPrompt(true);
        setIsDetectingLocation(false);
        return;
      }
      
      const isTimeout = error?.code === 3 || error?.message?.toLowerCase().includes('timeout');
      const isAccuracyError = error?.message?.toLowerCase().includes('accuracy too low');
      
      // Auto-retry once on timeout or accuracy failure
      if (isTimeout || isAccuracyError) {
        console.log(`[CheckIn] ${isTimeout ? 'Timeout' : 'Accuracy too low'} on first attempt, retrying...`);
        try {
          // Wait 2s for GPS to warm up on accuracy errors
          if (isAccuracyError) {
            await new Promise(r => setTimeout(r, 2000));
          }
          // Retry with relaxed threshold (200m)
          const locData = await captureLocationWithVenue(200);
          setLocationData(locData);
          if (locData.venueName && locData.venueId) {
            setDetectedVenue(locData.venueName);
            setCustomVenue(locData.venueName);
            setSelectedVenueId(locData.venueId);
            setShowVenueConfirm(true);
          } else {
            setDetectedVenue('');
            setCustomVenue('');
            setSelectedVenueId(null);
            setIsEditingVenue(true);
            setShowVenueConfirm(true);
          }
          setIsDetectingLocation(false);
          return;
        } catch (retryError: any) {
          console.error('Retry also failed:', retryError);
          if (retryError?.code === 1) {
            setLocationErrorType('permission_denied');
            setShowLocationPrompt(true);
            setIsDetectingLocation(false);
            return;
          }
          // If retry also fails on accuracy, let user pick venue manually instead of blocking
          if (retryError?.message?.toLowerCase().includes('accuracy too low')) {
            console.log('[CheckIn] Accuracy still low after retry, allowing manual venue entry');
            setDetectedVenue('');
            setCustomVenue('');
            setSelectedVenueId(null);
            setIsEditingVenue(true);
            setShowVenueConfirm(true);
            setIsDetectingLocation(false);
            return;
          }
        }
      }
      
      // Show location prompt for position unavailable or timeout
      if (error?.code === 2) {
        setLocationErrorType('position_unavailable');
        setShowLocationPrompt(true);
      } else if (isTimeout) {
        setLocationErrorType('timeout');
        setShowLocationPrompt(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'Location error',
          description: error?.message || 'Could not get your location. Please try again.',
        });
      }
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleStatusUpdate = async (status: 'out' | 'heading_out' | 'home' | 'planning' | 'private_party') => {
    setSelectedStatus(status);

    if (status === 'out') {
      setShowShareModal(true);
    } else if (status === 'heading_out') {
      await captureAndDeriveVenue();
    } else if (status === 'planning') {
      // Show privacy selector first for planning mode
      setShowPlanningPrivacy(true);
    } else if (status === 'private_party') {
      // Show privacy selector first for private party
      setShowPrivatePartyPrivacy(true);
    } else {
      await stopLocationTracking();
      await updateStatus(status, null, null, null);
      onOpenChange(false);
    }
  };

  const handlePrivatePartyPrivacyConfirm = async () => {
    setShowPrivatePartyPrivacy(false);
    setPrivatePartyNeighborhood(undefined);
    setShowNeighborhoodManualSelect(false);
    setShowPrivatePartyNeighborhood(true);
    
    // Refresh city detection based on current GPS before detecting neighborhood
    const detectedCity = await refreshCity();
    
    // Auto-detect neighborhood from GPS
    setIsDetectingNeighborhood(true);
    try {
      const detectedNeighborhood = await detectNeighborhoodFromGPS(detectedCity);
      if (detectedNeighborhood) {
        setPrivatePartyNeighborhood(detectedNeighborhood);
      } else {
        // Fallback to manual selection if detection fails
        setShowNeighborhoodManualSelect(true);
      }
    } catch (error) {
      console.error('Failed to detect neighborhood:', error);
      setShowNeighborhoodManualSelect(true);
    } finally {
      setIsDetectingNeighborhood(false);
    }
  };

  const handlePrivatePartyNeighborhoodConfirm = async () => {
    if (!privatePartyNeighborhood) return;
    
    await updatePrivatePartyStatus();
    setShowPrivatePartyNeighborhood(false);
    // Ask if they want to invite friends
    setShowPrivatePartyInvite(true);
  };

  const updatePrivatePartyStatus = async () => {
    if (!user) return;
    
    try {
      // Get user's actual GPS coordinates for proximity-based Yap access
      let userLat: number | null = null;
      let userLng: number | null = null;
      try {
        const { getCurrentLocation } = await import('@/lib/location-service');
        const coords = await getCurrentLocation();
        userLat = coords.lat;
        userLng = coords.lng;
      } catch (locError) {
        console.warn('[PrivateParty] Could not get GPS coords, storing null:', locError);
      }

      const partyDisplayName = `Private Party (${privatePartyNeighborhood})`;
      const statusData = {
        user_id: user.id,
        status: 'out' as const,
        lat: userLat,
        lng: userLng,
        venue_name: partyDisplayName,
        venue_id: null,
        updated_at: new Date().toISOString(),
        expires_at: calculateExpiryTime(),
        planning_neighborhood: null,
        planning_visibility: privatePartyVisibility,
        is_private_party: true,
        party_neighborhood: privatePartyNeighborhood,
        party_address: privatePartyAddress || null,
      };

      const { error } = await supabase
        .from('night_statuses')
        .upsert(statusData, { onConflict: 'user_id' });

      if (error) throw error;

      // Update profile
      await supabase
        .from('profiles')
        .update({ 
          is_out: true,
          location_sharing_level: privatePartyVisibility,
        })
        .eq('id', user.id);

      haptic.medium();
      
      // Show confirmation
      showOutConfirmation(`Private Party (${privatePartyNeighborhood})`, '', privatePartyVisibility, true);
      
      logEvent('private_party_checkin', {
        neighborhood: privatePartyNeighborhood,
        visibility: privatePartyVisibility,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const handlePrivatePartyInvitesSent = () => {
    setShowPrivatePartyInvite(false);
    onOpenChange(false);
  };

  const handlePlanningPrivacyConfirm = async () => {
    setShowPlanningPrivacy(false);
    // Refresh city detection based on current GPS before showing neighborhoods
    setPlanningNeighborhood(undefined);
    await refreshCity();
    setShowPlanningNeighborhood(true);
  };

  const handlePlanningConfirm = async (skipNeighborhood: boolean = false) => {
    const neighborhood = skipNeighborhood ? null : (planningNeighborhood || null);
    await updateStatus('planning', null, null, null, null, neighborhood, planningVisibility);
    setShowPlanningNeighborhood(false);
    onOpenChange(false);
    // Show planning confirmation card
    showPlanningConfirmation(neighborhood, planningVisibility);
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
        if (error?.code === 1) {
          setLocationErrorType('permission_denied');
          setShowLocationPrompt(true);
        } else {
          toast({
            variant: 'destructive',
            title: 'Turn on location to share where you are',
            description: 'Location permission is required to share your location.',
          });
        }
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

    // Use selected venue if user picked from dropdown, otherwise use original
    let finalVenueId = selectedVenueId || locationData.venueId;
    let finalVenueName = customVenue.trim() || locationData.venueName;
    let isCustomVenue = false;

    // If user entered custom venue and no venue ID, create new venue
    if (!finalVenueId && customVenue.trim()) {
      isCustomVenue = true;
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
      // Clear any pending reminder since user is now checking in
      localStorage.removeItem('checkin_reminder');
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

        // For custom venues (no DB venue ID), detect neighborhood and set as private party
        if (isCustomVenue && !finalVenueId) {
          let detectedNeighborhood: string | null = null;
          try {
            const { data: nearestVenue } = await supabase.rpc('find_nearest_venue', {
              user_lat: locationData.lat,
              user_lng: locationData.lng,
              radius_meters: 50000,
            });
            if (nearestVenue?.[0]) {
              const { data: venueData } = await supabase
                .from('venues')
                .select('neighborhood')
                .eq('id', nearestVenue[0].venue_id)
                .maybeSingle();
              detectedNeighborhood = venueData?.neighborhood || null;
            }
          } catch (e) {
            console.warn('Neighborhood detection failed for custom venue:', e);
          }

          // Update night_statuses with private party info + neighborhood
          await supabase.from('night_statuses').upsert({
            user_id: user?.id,
            status: 'out',
            lat: locationData.lat,
            lng: locationData.lng,
            venue_name: finalVenueName,
            venue_id: null,
            updated_at: new Date().toISOString(),
            expires_at: calculateExpiryTime(),
            is_private_party: true,
            party_neighborhood: detectedNeighborhood,
            planning_visibility: shareOption,
          }, { onConflict: 'user_id' });

          const displayName = detectedNeighborhood
            ? `${finalVenueName} (${detectedNeighborhood})`
            : finalVenueName;
          
          onOpenChange(false);
          showOutConfirmation(displayName, '', shareOption, true);
        } else {
          await updateStatus('out', locationData.lat, locationData.lng, finalVenueName, finalVenueId);
          onOpenChange(false);
          showOutConfirmation(finalVenueName, finalVenueId || '', shareOption);
        }
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
        
        // Mark manual checkin to prevent auto-tracker from overwriting
        markManualCheckin();
        
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

      // Only show toast for statuses that don't have confirmation cards
      if (status !== 'out' && status !== 'planning') {
        const description = 
          status === 'home' ? "You won't appear on tonight's list." : 
          `You're still deciding - heading to ${venue}!`;

        toast({
          title: 'Status updated!',
          description,
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const StatusContent = () => (
    <div className="relative flex flex-col items-center justify-between p-6 min-h-[600px] animate-scale-in">
      {/* Subtle corner accent for depth */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-radial from-[#a855f7]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="relative w-full flex items-start justify-between pt-4">
        <h1 className="text-2xl font-light tracking-[0.3em] text-white/90">Spotted</h1>
        <img 
          src={spottedLogo} 
          alt="Spotted" 
          className="h-10 w-10 object-contain drop-shadow-[0_0_8px_rgba(212,255,0,0.5)]" 
        />
      </div>

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center w-full">
        <h2 className="text-4xl font-semibold text-[#d4ff00] text-center mb-8 tracking-wide drop-shadow-[0_0_10px_rgba(212,255,0,0.25)]">
          Are you out?
        </h2>

        <div className="w-full space-y-4">
          {/* Yes - Primary button with refined glow */}
          <Button
            onClick={() => {
              handleStatusUpdate('out');
            }}
            size="lg"
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-b from-[#e8ff66] to-[#d4ff00] text-[#0a0118] hover:from-[#f0ff80] hover:to-[#e5ff4d] shadow-[0_0_20px_rgba(212,255,0,0.2),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_0_28px_rgba(212,255,0,0.35),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            {isDetectingLocation && selectedStatus === 'out' ? 'Detecting location...' : 'Yes 🎉'}
          </Button>
          
          {/* Planning - Secondary button with subtle glow */}
          <Button
            onClick={() => {
              handleStatusUpdate('planning');
            }}
            size="lg"
            className="w-full h-14 text-lg font-medium rounded-2xl bg-gradient-to-b from-[#a855f7]/90 to-[#7c3aed] text-white border border-[#a855f7]/25 hover:border-[#a855f7]/40 hover:from-[#b668f8]/90 hover:to-[#9333ea] shadow-[0_0_16px_rgba(168,85,247,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_0_24px_rgba(168,85,247,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            Planning on it 🎯
          </Button>

          {/* No - Tertiary glass button with refined effect */}
          <Button
            onClick={() => {
              handleStatusUpdate('home');
            }}
            variant="ghost"
            size="lg"
            className="w-full h-14 text-lg font-medium rounded-2xl bg-white/[0.04] backdrop-blur-md border border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white/85 hover:border-white/20 transition-all duration-200 disabled:opacity-50"
            disabled={isDetectingLocation}
          >
            No — staying in 🛋️
          </Button>
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
          <div className="flex-1">
            <span className="text-lg text-white block">Close Friends 💛</span>
            <span className="text-sm text-white/50">Only your closest friends</span>
          </div>
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
          <div className="flex-1">
            <span className="text-lg text-white block">All Friends 👫</span>
            <span className="text-sm text-white/50">Everyone you're friends with</span>
          </div>
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
          <div className="flex-1">
            <span className="text-lg text-white block">Mutual Friends 🔗</span>
            <span className="text-sm text-white/50">Friends + their friends</span>
          </div>
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

  const handlePrivatePartyFromVenueConfirm = async () => {
    // Close venue confirm and start private party flow
    setShowVenueConfirm(false);
    setSelectedStatus('private_party');
    
    // Reuse the already-selected privacy tier from "I'm out" flow
    setPrivatePartyVisibility(shareOption);
    
    // Skip privacy screen, go directly to neighborhood selection
    setPrivatePartyNeighborhood(undefined);
    setShowNeighborhoodManualSelect(false);
    setShowPrivatePartyNeighborhood(true);
    
    // Auto-detect neighborhood from GPS
    const detectedCity = await refreshCity();
    setIsDetectingNeighborhood(true);
    try {
      const detectedNeighborhood = await detectNeighborhoodFromGPS(detectedCity);
      if (detectedNeighborhood) {
        setPrivatePartyNeighborhood(detectedNeighborhood);
      } else {
        setShowNeighborhoodManualSelect(true);
      }
    } catch (error) {
      console.error('Failed to detect neighborhood:', error);
      setShowNeighborhoodManualSelect(true);
    } finally {
      setIsDetectingNeighborhood(false);
    }
  };

  const handleVenueSelect = (venueId: string) => {
    const venue = locationData?.nearbyVenues.find(v => v.id === venueId);
    if (venue) {
      setSelectedVenueId(venue.id);
      setDetectedVenue(venue.name);
      setCustomVenue(venue.name);
    }
  };

  const VenueConfirmContent = () => {
    const nearbyVenues = locationData?.nearbyVenues || [];
    const hasMultipleVenues = nearbyVenues.length > 1;

    return (
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

            {/* Dropdown to select different nearby venue */}
            {hasMultipleVenues && (
              <div className="space-y-2">
                <p className="text-sm text-white/60">Not right? Select another:</p>
                <Select value={selectedVenueId ?? undefined} onValueChange={handleVenueSelect}>
                  <SelectTrigger className="h-12 bg-[#1a0f2e] border border-white/20 text-white focus:ring-[#d4ff00] focus:border-[#d4ff00]">
                    <SelectValue placeholder="Select a different venue..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a0f2e] border border-white/20 z-[600]">
                    {nearbyVenues.map((venue) => (
                      <SelectItem 
                        key={venue.id} 
                        value={venue.id}
                        className="text-white hover:bg-[#5b21b6]/30 focus:bg-[#5b21b6]/30 cursor-pointer"
                      >
                        {venue.name} ({Math.round(venue.distance)}m)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* No venue detected - show options */}
            {!detectedVenue && (
              <div className="space-y-3 mb-4">
                <p className="text-sm text-white/60 text-center">
                  No nearby venues found
                </p>
                
              </div>
            )}
            
            <Input
              value={customVenue}
              onChange={(e) => setCustomVenue(e.target.value)}
              onFocus={handleInputFocus}
              placeholder={detectedVenue ? "Enter different venue..." : "Enter venue name..."}
              className="h-14 text-lg bg-[#1a0f2e] border-2 border-[#d4ff00] text-white placeholder:text-white/40 focus:ring-[#d4ff00]"
              autoFocus={!!detectedVenue}
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
          </div>
        )}

        <Button
          onClick={handleVenueConfirm}
          disabled={!customVenue.trim()}
          className="w-full h-14 text-lg font-semibold rounded-full bg-[#5b21b6] text-[#d4ff00] border-2 border-[#d4ff00] hover:bg-[#6d28d9] shadow-[0_0_20px_rgba(212,255,0,0.4)] disabled:opacity-50"
        >
          {detectedVenue ? 'Confirm' : 'Enter Venue Manually'}
        </Button>

        {/* Always show Private Party option */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-white/20" />
          <span className="text-white/40 text-sm">or</span>
          <div className="flex-1 h-px bg-white/20" />
        </div>
        <Button
          onClick={handlePrivatePartyFromVenueConfirm}
          className="w-full h-14 text-lg font-medium rounded-2xl bg-gradient-to-b from-[#6366f1] to-[#4f46e5] text-white border border-[#6366f1]/40 hover:from-[#818cf8] hover:to-[#6366f1] hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all duration-200"
        >
          <Home className="w-5 h-5 mr-2" />
          I'm at a Private Party
        </Button>
      </div>
    );
  };

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
          <Select value={planningNeighborhood ?? undefined} onValueChange={setPlanningNeighborhood}>
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
          <div className="flex-1">
            <span className="text-lg text-white block">Close Friends 💛</span>
            <span className="text-sm text-white/50">Only your closest friends</span>
          </div>
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
          <div className="flex-1">
            <span className="text-lg text-white block">All Friends 👫</span>
            <span className="text-sm text-white/50">Everyone you're friends with</span>
          </div>
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
          <div className="flex-1">
            <span className="text-lg text-white block">Mutual Friends 🔗</span>
            <span className="text-sm text-white/50">Friends + their friends</span>
          </div>
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

  const PrivatePartyPrivacyContent = () => (
    <div className="relative p-6 space-y-6">
      <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
      
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-[#6366f1]/20 flex items-center justify-center">
          <Home className="h-6 w-6 text-[#6366f1]" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-white">Private Party</h3>
          <p className="text-white/60 text-sm">Who can see you're at a party?</p>
        </div>
      </div>
      
      <div className="h-px bg-white/20" />

      <div className="space-y-4">
        <button
          onClick={() => setPrivatePartyVisibility('close_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            privatePartyVisibility === 'close_friends' ? 'border-[#6366f1]' : 'border-white/40'
          }`}>
            {privatePartyVisibility === 'close_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#6366f1]" />
            )}
          </div>
          <div className="flex-1">
            <span className="text-lg text-white block">Close Friends 💛</span>
            <span className="text-sm text-white/50">Only your closest friends</span>
          </div>
        </button>

        <button
          onClick={() => setPrivatePartyVisibility('all_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            privatePartyVisibility === 'all_friends' ? 'border-[#6366f1]' : 'border-white/40'
          }`}>
            {privatePartyVisibility === 'all_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#6366f1]" />
            )}
          </div>
          <div className="flex-1">
            <span className="text-lg text-white block">All Friends 👫</span>
            <span className="text-sm text-white/50">Everyone you're friends with</span>
          </div>
        </button>

        <button
          onClick={() => setPrivatePartyVisibility('mutual_friends')}
          className="w-full flex items-center gap-4 text-left"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            privatePartyVisibility === 'mutual_friends' ? 'border-[#6366f1]' : 'border-white/40'
          }`}>
            {privatePartyVisibility === 'mutual_friends' && (
              <div className="w-4 h-4 rounded-full bg-[#6366f1]" />
            )}
          </div>
          <div className="flex-1">
            <span className="text-lg text-white block">Mutual Friends 🔗</span>
            <span className="text-sm text-white/50">Friends + their friends</span>
          </div>
        </button>
      </div>

      <Button
        onClick={handlePrivatePartyPrivacyConfirm}
        className="w-full h-14 text-lg font-semibold rounded-full bg-[#6366f1] text-white border-2 border-[#6366f1] hover:bg-[#6366f1]/80 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
      >
        Continue
      </Button>
    </div>
  );

  const PrivatePartyNeighborhoodContent = () => {
    const neighborhoods = CITY_NEIGHBORHOODS[city] || CITY_NEIGHBORHOODS['la'];
    
    // Loading state while detecting
    if (isDetectingNeighborhood) {
      return (
        <div className="relative p-6 space-y-6">
          <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#6366f1]/20 flex items-center justify-center">
              <Home className="h-6 w-6 text-[#6366f1]" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Private Party</h3>
              <p className="text-white/60 text-sm">Finding your neighborhood...</p>
            </div>
          </div>
          
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3 text-white/70">
              <MapPin className="h-5 w-5 animate-pulse text-[#6366f1]" />
              <span>📍 Detecting your neighborhood...</span>
            </div>
          </div>
        </div>
      );
    }

    // Confirmation state (auto-detected)
    if (privatePartyNeighborhood && !showNeighborhoodManualSelect) {
      return (
        <div className="relative p-6 space-y-6">
          <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#6366f1]/20 flex items-center justify-center">
              <Home className="h-6 w-6 text-[#6366f1]" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Private Party</h3>
              <p className="text-white/60 text-sm">Only the area is shown, not the address</p>
            </div>
          </div>
          
          <div className="h-px bg-white/20" />

          <div className="text-center py-4">
            <p className="text-white/60 text-sm mb-2">📍 Detected:</p>
            <p className="text-2xl font-semibold text-white">{privatePartyNeighborhood}</p>
          </div>

          <Button
            onClick={handlePrivatePartyNeighborhoodConfirm}
            className="w-full h-14 text-lg font-semibold rounded-full bg-[#6366f1] text-white border-2 border-[#6366f1] hover:bg-[#6366f1]/80 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
          >
            Looks right!
          </Button>

          <button
            onClick={() => setShowNeighborhoodManualSelect(true)}
            className="w-full text-center text-white/60 text-sm hover:text-white/80 transition-colors"
          >
            Not right? Change
          </button>
        </div>
      );
    }

    // Manual selection fallback
    return (
      <div className="relative p-6 space-y-6">
        <img src={spottedLogo} alt="Spotted" className="absolute top-4 right-4 h-10 w-10 object-contain" />
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[#6366f1]/20 flex items-center justify-center">
            <Home className="h-6 w-6 text-[#6366f1]" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">What neighborhood?</h3>
            <p className="text-white/60 text-sm">Only the area is shown, not the address</p>
          </div>
        </div>
        
        <div className="h-px bg-white/20" />

        <div className="space-y-4">
          <Select value={privatePartyNeighborhood ?? undefined} onValueChange={setPrivatePartyNeighborhood}>
            <SelectTrigger className="h-14 text-lg bg-[#1a0f2e] border-2 border-[#6366f1]/50 text-white focus:ring-[#6366f1] focus:border-[#6366f1]">
              <SelectValue placeholder="Select neighborhood..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a0f2e] border-2 border-[#6366f1]/30 max-h-60 z-[600]">
              {neighborhoods.map((neighborhood) => (
                <SelectItem 
                  key={neighborhood} 
                  value={neighborhood}
                  className="text-white hover:bg-[#6366f1]/20 focus:bg-[#6366f1]/20 cursor-pointer"
                >
                  {neighborhood}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handlePrivatePartyNeighborhoodConfirm}
          disabled={!privatePartyNeighborhood}
          className="w-full h-14 text-lg font-semibold rounded-full bg-[#6366f1] text-white border-2 border-[#6366f1] hover:bg-[#6366f1]/80 shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-50"
        >
          Confirm
        </Button>

        <p className="text-center text-sm text-white/60 italic">
          Friends will see a fuzzy pin in this area
        </p>
      </div>
    );
  };

  // Determine if any private party modal is showing
  const isPrivatePartyFlowOpen = showPrivatePartyPrivacy || showPrivatePartyNeighborhood;

  return (
    <>
      {/* Status Modal */}
      {isMobile ? (
        <Drawer open={open && !showShareModal && !showVenueConfirm && !showPlanningNeighborhood && !showPlanningPrivacy && !isPrivatePartyFlowOpen} onOpenChange={onOpenChange}>
          <DrawerContent className="bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/98 to-[#0a0118] backdrop-blur-xl border-0 border-t border-white/10 shadow-[0_-20px_60px_rgba(168,85,247,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <StatusContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open && !showShareModal && !showVenueConfirm && !showPlanningNeighborhood && !showPlanningPrivacy && !isPrivatePartyFlowOpen} onOpenChange={onOpenChange}>
          <DialogContent className="bg-gradient-to-b from-[#2d1b4e]/95 via-[#1a0f2e]/98 to-[#0a0118] backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgba(168,85,247,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] max-w-md p-0 overflow-hidden rounded-3xl" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Update Status</DialogTitle></VisuallyHidden>
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
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Share Location</DialogTitle></VisuallyHidden>
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
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Planning Privacy</DialogTitle></VisuallyHidden>
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
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Planning Neighborhood</DialogTitle></VisuallyHidden>
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
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(147,51,234,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Confirm Venue</DialogTitle></VisuallyHidden>
            <VenueConfirmContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Private Party Privacy Modal */}
      {isMobile ? (
        <Drawer open={showPrivatePartyPrivacy} onOpenChange={setShowPrivatePartyPrivacy}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <PrivatePartyPrivacyContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showPrivatePartyPrivacy} onOpenChange={setShowPrivatePartyPrivacy}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(99,102,241,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Private Party Privacy</DialogTitle></VisuallyHidden>
            <PrivatePartyPrivacyContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Private Party Neighborhood Modal */}
      {isMobile ? (
        <Drawer open={showPrivatePartyNeighborhood} onOpenChange={setShowPrivatePartyNeighborhood}>
          <DrawerContent className="bg-[#2d1b4e] border-0">
            <PrivatePartyNeighborhoodContent />
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showPrivatePartyNeighborhood} onOpenChange={setShowPrivatePartyNeighborhood}>
          <DialogContent className="bg-[#2d1b4e] border-0 shadow-[0_0_40px_rgba(99,102,241,0.6)] max-w-sm p-0 overflow-hidden" aria-describedby={undefined}>
            <VisuallyHidden><DialogTitle>Private Party Neighborhood</DialogTitle></VisuallyHidden>
            <PrivatePartyNeighborhoodContent />
          </DialogContent>
        </Dialog>
      )}

      {/* Private Party Invite Modal */}
      <PrivatePartyInviteModal
        open={showPrivatePartyInvite}
        onClose={() => {
          setShowPrivatePartyInvite(false);
          onOpenChange(false);
        }}
        neighborhood={privatePartyNeighborhood}
        address={privatePartyAddress}
        onAddressChange={setPrivatePartyAddress}
        onInvitesSent={handlePrivatePartyInvitesSent}
      />

      {/* Location Permission Prompt */}
      <LocationPermissionPrompt
        open={showLocationPrompt}
        onOpenChange={setShowLocationPrompt}
        errorType={locationErrorType}
        onRetry={() => {
          setShowLocationPrompt(false);
          captureAndDeriveVenue();
        }}
      />
    </>
  );
}
