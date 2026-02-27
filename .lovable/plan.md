

## Plan: Add Debug Logging to Venue Detection

### Changes

**1. `src/lib/location-service.ts` — Add `accuracy` to `LocationData` and return it**

- Add `accuracy: number` field to the `LocationData` interface (between `lng` and `timestamp`)
- In `captureLocationWithVenue()`, add `accuracy: coords.accuracy` to the return object (line ~411)

**2. `src/components/CheckInModal.tsx` — Add debug console logs after `captureLocationWithVenue()` returns**

After line 223 (`const locData = await captureLocationWithVenue();`), insert:

```typescript
console.log('=== VENUE DEBUG ===');
console.log('GPS coords:', locData.lat, locData.lng);
console.log('GPS accuracy:', locData.accuracy);
console.log('Nearby venues returned:', JSON.stringify(locData.nearbyVenues));
console.log('Selected venue:', locData.venueName, locData.venueId);
```

### Files
- `src/lib/location-service.ts` — add `accuracy` to interface + return value
- `src/components/CheckInModal.tsx` — add 5 debug log lines after venue capture

