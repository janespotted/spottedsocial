

## Plan: Make Demo Mode Use Real GPS for Venue Matching

Two code paths currently hardcode venues in demo mode. Both need to use real GPS + `captureLocationWithVenue()` instead, **except** when activated via the magic URL (`?demo=yc`), which should keep its hardcoded venue for consistent reviewer experience.

### Changes

**1. `src/components/CheckInModal.tsx` — Replace demo venue hardcoding with real GPS**

Replace lines 189-221 (the `if (demoMode.enabled)` block in `captureAndDeriveVenue`) so that demo mode falls through to the normal `captureLocationWithVenue()` path. The only difference: relax the 50m accuracy gate slightly (use 150m) so demo users in tricky GPS environments still get a result.

```typescript
// Demo mode: still use real GPS, just log that demo is active
const demoMode = getDemoMode();
if (demoMode.enabled) {
  console.log('[Demo] Using real GPS for venue detection');
}

const locData = await captureLocationWithVenue();
// ... existing debug logs and state updates continue as normal
```

Remove the `DEMO_VENUES` constant and the entire short-circuit block (lines 191-221).

**2. `src/components/DemoActivator.tsx` — Use real GPS for initial demo check-in**

In the `activateDemo` function (line ~98-100), replace the hardcoded `FEATURED_VENUES[city]` auto-check-in with a real GPS venue lookup:

- Try `captureLocationWithVenue()` to get the user's actual nearest venue
- If GPS fails or no venue found within 500m, fall back to the existing `FEATURED_VENUES` hardcoded venue (graceful degradation)
- Keep `FEATURED_VENUES` as the fallback only, not the primary path

```typescript
// Try real GPS first
let venueName: string | null = null;
try {
  const locData = await captureLocationWithVenue();
  if (locData.venueId && locData.venueName) {
    venueName = await simulateCheckinForDemo(userId, city, {
      name: locData.venueName,
      lat: locData.lat,
      lng: locData.lng,
    });
  }
} catch (e) {
  logger.debug('demo:gps-failed-using-fallback', { error: String(e) });
}
// Fallback to featured venue if GPS didn't work
if (!venueName) {
  const venue = FEATURED_VENUES[city];
  venueName = await simulateCheckinForDemo(userId, city, venue);
}
```

**3. Keep magic URL path unchanged**

The `?demo=yc` activation via `DemoActivator` stores a `PendingDemoActivation` with the city. The fallback to `FEATURED_VENUES` ensures magic URL reviewers still get the expected venue if they're not physically near one.

### Files
- `src/components/CheckInModal.tsx` — remove demo venue hardcoding, use real GPS path
- `src/components/DemoActivator.tsx` — try real GPS first, fall back to featured venue

