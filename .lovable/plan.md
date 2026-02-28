

## Fix: Missing Venue Pins + Increase Demo Friends to ~20

### Issue 1: Venue pins not rendering

**Root cause**: Race condition in the venue rendering `useEffect` (line 1036-1248). When `filteredVenues` state updates after the venue fetch, the `useEffect` fires but `map.isStyleLoaded()` returns `false` (line 1039), so it exits early. The venues data never changes again, so the `useEffect` never re-fires.

**Fix in `src/pages/Map.tsx`**:
- Add a `styleLoaded` state that gets set `true` in a `map.on('style.load', ...)` callback
- Include `styleLoaded` in the venue rendering `useEffect` dependency array so it re-fires once the style is ready

### Issue 2: Only 8 friends out — need ~20

**Root cause**: The `seed-demo-data` edge function creates only 12 demo profiles total (8 "out", 4 "planning"). The user wants ~20 visible friends/mutual friends.

**Fix in `supabase/functions/seed-demo-data/index.ts`**:
- Increase demo user count from 12 to 24
- Add more city-specific usernames (12 more per city)
- Distribute 16 users as "out" across 6-7 venues (more spread) and 8 as "planning"
- This gives ~16 friends out + 8 planning = social proof with geographic spread

### Files changed
1. `src/pages/Map.tsx` — Add style-loaded tracking to fix venue pin rendering
2. `supabase/functions/seed-demo-data/index.ts` — Scale demo users from 12→24, out statuses from 8→16

