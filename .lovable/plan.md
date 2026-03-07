

## Plan: Fix demo friend avatars not showing on map

### Root Cause

When demo mode is on, friend locations are built from `night_statuses` (lines 370-388) but **don't include `last_location_at`**. The marker rendering code (line 810) filters out any friend where `getStalenessMins(last_location_at) >= 60`. Since `last_location_at` is `undefined` for demo friends, `getStalenessMins` returns 999 → all demo markers are silently filtered out.

### Fix

**`src/pages/Map.tsx`** — Set `last_location_at` to the current time (`new Date().toISOString()`) when mapping demo friend locations (line 377). This makes demo friends appear "just seen" and pass the staleness filter.

| File | Change |
|------|--------|
| `src/pages/Map.tsx` (line ~377-388) | Add `last_location_at: new Date().toISOString()` to the demo friend location mapping |

Single-line addition. No other files, DB changes, or RLS updates needed. Non-demo (real) friends are unaffected since they follow a completely separate code path.

