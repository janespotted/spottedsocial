

# Fix: Demo Check-in Shows "Private Party" Instead of Le Bain

## Root Cause

The `simulateCheckinForDemo` function upserts into `night_statuses` but never sets `is_private_party: false`. When the user previously checked into a private party, that boolean flag persists through the upsert (Postgres only updates columns you specify). The profile page then renders "Out - Private Party (Santa Monica)" instead of "Out - Le Bain".

Current DB state confirms this: `is_private_party: true`, `venue_name: Thunderbolt` (a leftover from a prior session).

## Fix

**File: `src/components/DemoActivator.tsx`**

Add `is_private_party: false` and `planning_neighborhood: null` to the upsert in `simulateCheckinForDemo` to fully reset the night status:

```typescript
await supabase.from('night_statuses').upsert({
  user_id: userId,
  status: 'out',
  venue_id: venueData.id,
  venue_name: venue.name,
  lat: venue.lat,
  lng: venue.lng,
  expires_at: expiresAt,
  updated_at: now,
  is_private_party: false,       // <-- ADD
  planning_neighborhood: null,   // <-- ADD
}, { onConflict: 'user_id' });
```

## Summary

| File | Change |
|------|--------|
| `src/components/DemoActivator.tsx` | Add `is_private_party: false` and `planning_neighborhood: null` to the night_status upsert to fully reset previous check-in state |

## Expected Result

After re-activating demo mode (revisit the magic URL), the profile will correctly show "Out - Le Bain" instead of "Private Party (Santa Monica)".

