
# Demo Mode: Force Le Bain Location on "Yes I'm Out"

## Problem
When a YC reviewer in demo mode taps "Yes I'm Out" in the Are You Out modal, the app tries to get their real GPS -- which resolves to LA (or wherever they actually are), not NYC. The demo experience breaks because the detected venue won't be Le Bain.

## Solution

Intercept the `captureLocationWithVenue` call in `CheckInModal.tsx` when demo mode is active. Instead of hitting GPS, return fake location data pointing to Le Bain (or the city's featured venue).

**File: `src/components/CheckInModal.tsx`**

1. Import `getDemoMode` from `@/lib/demo-data` and the `FEATURED_VENUES` concept (we'll inline the coords or look up from the venues table)
2. Modify `captureAndDeriveVenue` to check demo mode first:
   - If demo enabled, look up the featured venue for the demo city from the `venues` table (e.g., "Le Bain" for NYC)
   - Return a fake `LocationData` with that venue's coordinates, name, and ID -- skip GPS entirely
   - Fall through to normal GPS flow if demo mode is off

**Changes (~15 lines added):**

```typescript
import { getDemoMode } from '@/lib/demo-data';
import { getCachedCity } from '@/lib/city-detection';

// Inside captureAndDeriveVenue:
const demoMode = getDemoMode();
if (demoMode.enabled) {
  const demoCity = getCachedCity() || 'nyc';
  const DEMO_VENUES: Record<string, { name: string; lat: number; lng: number }> = {
    nyc: { name: 'Le Bain', lat: 40.7414, lng: -74.0078 },
    la: { name: 'Sound Nightclub', lat: 34.0412, lng: -118.2468 },
    pb: { name: 'Cucina', lat: 26.7056, lng: -80.0364 },
  };
  const venue = DEMO_VENUES[demoCity] || DEMO_VENUES.nyc;
  
  // Look up venue ID from database
  const { data: venueRow } = await supabase
    .from('venues')
    .select('id')
    .eq('name', venue.name)
    .maybeSingle();
  
  const locData: LocationData = {
    lat: venue.lat,
    lng: venue.lng,
    timestamp: new Date().toISOString(),
    venueId: venueRow?.id || null,
    venueName: venue.name,
    nearbyVenues: [],
  };
  setLocationData(locData);
  setDetectedVenue(venue.name);
  setCustomVenue(venue.name);
  setSelectedVenueId(venueRow?.id || null);
  setShowVenueConfirm(true);
  setIsDetectingLocation(false);
  return;
}
```

This is scoped entirely to demo mode -- production users are completely unaffected.

## Summary

| File | Change |
|------|--------|
| `src/components/CheckInModal.tsx` | Import demo helpers; short-circuit `captureAndDeriveVenue` to return featured venue coords when demo mode is active |
