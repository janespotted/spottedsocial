

## Fix: Maps Opens Native Apple Maps Instead of In-App Browser

### Problem
`VenueIdCard.tsx` uses `https://maps.apple.com/` URLs for directions. On iOS, these deep-link directly into the native Apple Maps app, pulling the user out of Spotted entirely.

### Fix
Replace the Apple Maps URL with a Google Maps URL (`https://www.google.com/maps/dir/`). Google Maps web URLs open in the in-app browser (via Capacitor's `Browser.open`) on iOS, keeping the user in the app experience.

### Change

**`src/components/VenueIdCard.tsx`** — `handleMapPinClick` (~line 493-499)

Replace:
```ts
const appleMapsUrl = `https://maps.apple.com/?daddr=${venue.lat},${venue.lng}&dirflg=d`;
```
With:
```ts
const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`;
```

Single line change, no other files affected.

