import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCheckIn } from '@/contexts/CheckInContext';
import { haptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { findNearbyVenues } from '@/lib/location-service';
import { MapPin, MapPinOff, Search, Navigation, ChevronRight, Music, Wine, Beer, Building, Sofa } from 'lucide-react';

interface NearbyVenue {
  id: string;
  name: string;
  distance: number;
  neighborhood?: string;
  type?: string;
}

interface UpdateSpotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function UpdateSpotSheet({ open, onOpenChange, onUpdated }: UpdateSpotSheetProps) {
  const { user } = useAuth();
  const { showOutConfirmation } = useCheckIn();
  const [nearbyVenues, setNearbyVenues] = useState<NearbyVenue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NearbyVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSearchResults([]);
      setShowCustomInput(false);
      setCustomName('');
      fetchNearbyVenues();
    }
  }, [open]);

  const fetchNearbyVenues = async () => {
    setLoadingVenues(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true })
      );
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);

      // Use findNearbyVenues which includes Mapbox fallback for areas without DB venues
      const venues = await findNearbyVenues(loc.lat, loc.lng, 800, 8);

      if (venues.length > 0) {
        // Enrich with venue metadata (type, neighborhood) for DB venues
        const venueIds = venues.map(v => v.id).filter(Boolean);
        const { data: venueDetails } = await supabase
          .from('venues')
          .select('id, neighborhood, type')
          .in('id', venueIds);

        const detailsMap = new Map((venueDetails || []).map(v => [v.id, v]));

        setNearbyVenues(venues
          .filter(v => v.name) // exclude venues with no name
          .map(v => ({
            id: v.id,
            name: v.name,
            distance: Math.round(v.distance),
            neighborhood: detailsMap.get(v.id)?.neighborhood,
            type: detailsMap.get(v.id)?.type,
          }))
        );
      }
    } catch {
      // GPS not available
    } finally {
      setLoadingVenues(false);
    }
  };

  // Search venues by name
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('venues')
        .select('id, name, neighborhood, type')
        .ilike('name', `%${searchQuery}%`)
        .limit(8);

      if (data) {
        setSearchResults(data.map(v => ({
          id: v.id,
          name: v.name,
          neighborhood: v.neighborhood,
          type: v.type,
          distance: 0,
        })));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const switchToVenue = useCallback(async (venue: { id: string; name: string }) => {
    if (!user) return;
    setLoading(true);
    haptic.medium();

    try {
      const now = new Date().toISOString();
      const lat = userLocation?.lat ?? 0;
      const lng = userLocation?.lng ?? 0;

      // End existing check-ins
      await supabase
        .from('checkins')
        .update({ ended_at: now })
        .eq('user_id', user.id)
        .is('ended_at', null);

      // Create new check-in
      await supabase.from('checkins').insert({
        user_id: user.id,
        venue_id: venue.id,
        venue_name: venue.name,
        lat,
        lng,
        started_at: now,
      });

      // Update night status venue (keep existing status/privacy)
      await supabase
        .from('night_statuses')
        .update({
          venue_id: venue.id,
          venue_name: venue.name,
          lat,
          lng,
          updated_at: now,
        })
        .eq('user_id', user.id);

      // Update profile location
      await supabase
        .from('profiles')
        .update({
          last_known_lat: lat,
          last_known_lng: lng,
          last_location_at: now,
        })
        .eq('id', user.id);

      onOpenChange(false);
      onUpdated?.();
      // Show "You're out at X" confirmation card
      showOutConfirmation(venue.name, venue.id, 'all_friends');
    } catch (error) {
      console.error('Error switching venue:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [user, userLocation, onOpenChange, onUpdated, showOutConfirmation]);

  const handleCustomVenue = async () => {
    if (!customName.trim() || !user) return;
    setLoading(true);
    haptic.medium();

    try {
      const now = new Date().toISOString();
      const lat = userLocation?.lat ?? 0;
      const lng = userLocation?.lng ?? 0;

      // Detect neighborhood from GPS coords
      let detectedNeighborhood: string | null = null;
      try {
        const { data: nearestVenue } = await supabase.rpc('find_nearest_venue', {
          user_lat: lat,
          user_lng: lng,
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
        console.warn('Neighborhood detection failed:', e);
      }

      await supabase
        .from('checkins')
        .update({ ended_at: now })
        .eq('user_id', user.id)
        .is('ended_at', null);

      await supabase.from('checkins').insert({
        user_id: user.id,
        venue_name: customName.trim(),
        lat,
        lng,
        started_at: now,
      });

      await supabase
        .from('night_statuses')
        .update({
          venue_id: null,
          venue_name: customName.trim(),
          lat,
          lng,
          updated_at: now,
          is_private_party: true,
          party_neighborhood: detectedNeighborhood,
        })
        .eq('user_id', user.id);

      await supabase
        .from('profiles')
        .update({ last_known_lat: lat, last_known_lng: lng, last_location_at: now })
        .eq('id', user.id);

      onOpenChange(false);
      onUpdated?.();
      showOutConfirmation(customName.trim(), '', 'all_friends');
    } catch (error) {
      console.error('Error setting custom venue:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleStopSharing = async () => {
    if (!user) return;
    setLoading(true);
    haptic.medium();

    try {
      const now = new Date().toISOString();
      const expiry = new Date();
      if (expiry.getHours() < 5) { expiry.setHours(5, 0, 0, 0); } else { expiry.setDate(expiry.getDate() + 1); expiry.setHours(5, 0, 0, 0); }

      await supabase.from('night_statuses').upsert({
        user_id: user.id, status: 'off', venue_id: null, venue_name: null,
        lat: null, lng: null, updated_at: now, expires_at: expiry.toISOString(),
        is_private_party: false, planning_neighborhood: null,
      }, { onConflict: 'user_id' });

      await supabase.from('checkins').update({ ended_at: now }).eq('user_id', user.id).is('ended_at', null);

      await supabase.from('profiles').update({
        is_out: false, last_known_lat: null, last_known_lng: null, last_location_at: null,
      }).eq('id', user.id);

      toast.success('Location sharing stopped');
      onOpenChange(false);
      onUpdated?.();
    } catch (error) {
      console.error('Error stopping sharing:', error);
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const venueTypeIcon = (type?: string) => {
    switch (type) {
      case 'nightclub': return <Music className="h-4 w-4 text-[#a855f7]" />;
      case 'cocktail_bar': return <Wine className="h-4 w-4 text-[#a855f7]" />;
      case 'bar': return <Beer className="h-4 w-4 text-[#a855f7]" />;
      case 'rooftop': return <Building className="h-4 w-4 text-[#a855f7]" />;
      case 'lounge': return <Sofa className="h-4 w-4 text-[#a855f7]" />;
      default: return <MapPin className="h-4 w-4 text-[#d4ff00]" />;
    }
  };

  const displayedVenues = searchQuery.trim() ? searchResults : nearbyVenues;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-[#1a0f2e] border-[#a855f7]/30">
        <DrawerHeader>
          <DrawerTitle className="text-white text-center">Update your spot</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-8 space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search venues..."
              className="pl-10 bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-xl"
            />
          </div>

          {/* Nearby venues list */}
          {loadingVenues ? (
            <div className="text-center py-6">
              <div className="w-6 h-6 border-2 border-[#a855f7]/40 border-t-[#a855f7] rounded-full animate-spin mx-auto mb-2" />
              <p className="text-white/40 text-sm">Finding nearby spots...</p>
            </div>
          ) : displayedVenues.length > 0 ? (
            <div className="space-y-1">
              {!searchQuery.trim() && (
                <p className="text-white/40 text-xs uppercase tracking-wider mb-2 px-1">Nearby</p>
              )}
              {displayedVenues.map((venue) => (
                <button
                  key={venue.id}
                  onClick={() => switchToVenue(venue)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#a855f7]/10 transition-colors disabled:opacity-50"
                >
                  <span className="flex-shrink-0 flex items-center">{venueTypeIcon(venue.type)}</span>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-white font-medium text-sm truncate">{venue.name || 'Unknown venue'}</p>
                    {(venue.neighborhood || venue.distance > 0) && (
                      <p className="text-white/40 text-xs truncate">
                        {venue.type && `${venue.type.replace(/_/g, ' ')} · `}
                        {venue.neighborhood}
                        {venue.distance > 0 && ` · ${venue.distance}m`}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/20" />
                </button>
              ))}
            </div>
          ) : !searchQuery.trim() ? (
            <p className="text-white/40 text-sm text-center py-4">No venues found nearby</p>
          ) : (
            <p className="text-white/40 text-sm text-center py-4">No results for "{searchQuery}"</p>
          )}

          {/* Somewhere else */}
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-dashed border-white/10 hover:bg-white/5 transition-colors"
            >
              <Navigation className="w-4 h-4 text-white/40" />
              <span className="text-white/60 text-sm">Somewhere else</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Where are you?"
                className="bg-[#2d1b4e]/60 border-[#a855f7]/20 text-white placeholder:text-white/40 rounded-xl"
                autoFocus
              />
              <Button
                onClick={handleCustomVenue}
                disabled={!customName.trim() || loading}
                className="bg-[#d4ff00] text-[#0a0118] hover:bg-[#d4ff00]/90 rounded-xl px-4"
              >
                Go
              </Button>
            </div>
          )}

          {/* Stop sharing */}
          <div className="border-t border-white/10 pt-3">
            <Button
              onClick={handleStopSharing}
              disabled={loading}
              variant="ghost"
              className="w-full h-12 text-base text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-2xl"
            >
              <MapPinOff className="w-4 h-4 mr-2" />
              Stop Sharing Location
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

