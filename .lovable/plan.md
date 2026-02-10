

# Fix Demo Mode: Force NYC Location, Show People on Map

## Problems Identified

1. **City overridden by GPS**: When you open `?demo=yc&city=nyc`, the `DemoActivator` caches "nyc" but then `useUserCity` detects your real GPS (LA) and overwrites the cache. Result: app shows LA instead of NYC.

2. **No people on map**: Demo users are seeded at NYC venues, but since the city got overridden to LA, the map filters them out (it only shows demo users at venues matching the current city).

3. **Your own avatar missing from map**: The demo check-in creates a `night_statuses` row and a `checkins` row, but never sets `is_out = true` and `last_known_lat/lng` on your `profiles` row. The map reads `profiles.is_out` to show your yellow avatar marker -- since it's not set, you're invisible.

---

## Fix 1: Skip GPS detection when demo mode is active

**File: `src/hooks/useUserCity.ts`**

When demo mode is enabled, the hook should respect the cached city (set by DemoActivator) and NOT run GPS detection that would override it.

- Import `getDemoMode` from `@/lib/demo-data`
- If demo mode is ON, skip the `detectUserCity()` call entirely
- Only use the cached city value

## Fix 2: Update user's profile during demo check-in

**File: `src/components/DemoActivator.tsx`**

In the `simulateCheckinForDemo` function, after creating the night_status and checkin records, also update the user's `profiles` row:

```typescript
await supabase.from('profiles').update({
  is_out: true,
  last_known_lat: venue.lat,
  last_known_lng: venue.lng,
  last_location_at: now,
  last_active_at: now,
}).eq('id', userId);
```

This ensures the map's user-location logic finds valid coordinates and shows the yellow "me" marker.

## Fix 3: Add Palm Beach to FEATURED_VENUES

**File: `src/components/DemoActivator.tsx`**

The `FEATURED_VENUES` map is missing `'pb'`, which would crash if someone uses `?demo=yc&city=pb`. Add:

```typescript
pb: { name: 'Cucina', lat: 26.7056, lng: -80.0364 }
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useUserCity.ts` | Skip GPS detection when demo mode is active, use cached city |
| `src/components/DemoActivator.tsx` | Update `profiles` row with `is_out`, lat/lng during demo check-in; add `pb` to FEATURED_VENUES |

## Expected Result

- Opening `?demo=yc&city=nyc` from LA will force the app to stay on NYC
- Map will center on NYC and show demo user avatars at NYC venues
- Your own yellow avatar will appear at Le Bain
- Yap board will show NYC venue messages
- All works for `city=la` and `city=pb` too
