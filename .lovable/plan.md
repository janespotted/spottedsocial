

# Fix: Leaderboard Not Showing Friend Avatars in Demo Mode

## Root Cause

The demo night_statuses all have `venue_id = NULL`. The leaderboard query uses `venues!inner(...)` (an INNER JOIN), which completely excludes rows with null venue_id. So all 8 demo "out" users are invisible on the leaderboard.

**Why venue_id is null**: The seed function does an `upsert` with `onConflict:'name'`, but when venues already exist (from a previous seed), Supabase's upsert doesn't reliably return data for conflict rows. The `vm` Map ends up empty, so `vm.get(v.name)` returns `undefined` (stored as null).

## Fix

**File: `supabase/functions/seed-demo-data/index.ts`**

After the upsert, add a separate SELECT query to reliably fetch venue IDs by name:

```typescript
// Venues - upsert then fetch IDs separately (upsert may not return on conflict)
await sb.from('venues').upsert(
  V.map(v => ({ name: v.name, lat: v.lat, lng: v.lng, ... })),
  { onConflict: 'name' }
);

// Reliably fetch venue IDs
const { data: vens } = await sb.from('venues')
  .select('id, name')
  .in('name', V.map(v => v.name));

const vm = new Map((vens || []).map(v => [v.name, v.id]));
```

This ensures `vm.get('Le Bain')` always returns the correct UUID, and all night_statuses, posts, plans, and events get proper venue_id values.

## Summary

| File | Change |
|------|--------|
| `supabase/functions/seed-demo-data/index.ts` | Split upsert + select into two steps so venue IDs are always resolved, fixing null venue_id in all seeded data |

## Expected Result

After re-seeding (toggle demo off/on or revisit the magic URL), the leaderboard will show stacked friend avatars (3 at Le Bain, 2 at House of Yes, etc.) because venue_id will be properly set and the INNER JOIN will match.
