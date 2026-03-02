

## Three Problems, Two Fixes

### Problem 1: DM messages persist forever
`dm_messages` has no `expires_at` column and no cleanup. Messages from yesterday (and before) remain visible indefinitely. The app's ephemeral 5am-expiry philosophy should apply here.

### Problem 2: Friend location persists forever on the map
When a user goes "Out" and shares their location, `profiles.is_out`, `last_known_lat`, `last_known_lng`, and `last_location_at` are set. Nothing clears these at 5am. The map fetches friends where `is_out === true` and `last_known_lat/lng` are non-null — so a friend who was out 3 days ago still shows on the map.

### Problem 3: No scheduled cleanup at 5am
There is no cron job that runs at 5am to expire ephemeral data. Only the leaderboard refresh job exists (every 4 hours).

### Solution: Create a `5am-cleanup` edge function + cron job

**New edge function: `supabase/functions/5am-cleanup/index.ts`**
Runs at 5:10am UTC-4 (ET) daily via `pg_cron`. Performs:
1. **Clear stale locations**: Set `is_out = false`, `last_known_lat = null`, `last_known_lng = null`, `last_location_at = null` on all profiles where `is_out = true` and `last_location_at` is before today's 5am
2. **End stale check-ins**: Set `ended_at = now()` on all checkins where `ended_at IS NULL` and `started_at` is before today's 5am
3. **Delete expired DMs**: Delete all `dm_messages` where `created_at` is before today's 5am

**Client-side fix for Map (immediate, no waiting for cron)**:
In `src/pages/Map.tsx`, add a `last_location_at` filter — only show friends whose `last_location_at` is within the current night window (after today's 5am, or yesterday's 5am if before 5am now). This prevents stale 106-hour-old locations from showing even before the cron runs.

**Client-side fix for DMs (immediate)**:
In `src/pages/Thread.tsx`, filter fetched messages to only show those with `created_at` after the most recent 5am boundary.

**Cron job** (via SQL insert tool):
Schedule at `10 9 * * *` (9:10 UTC = 5:10am ET) to call the cleanup function.

### Files changed
- `supabase/functions/5am-cleanup/index.ts` — new edge function
- `supabase/config.toml` — register the new function
- `src/pages/Map.tsx` — filter out stale friend locations client-side
- `src/pages/Thread.tsx` — filter out yesterday's DMs client-side
- `src/components/messages/MessagesTab.tsx` — filter messages in thread list too
- Cron job SQL insert for scheduling

