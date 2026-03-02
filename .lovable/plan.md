

## Fix: Stale "Out Now" Friends from Old Checkins

### Root Cause
In `MyFriendsTab.tsx` line 92, the checkins query fetches **all** checkins where `ended_at IS NULL` with no time boundary. If a checkin from days ago was never properly ended by the daily cleanup (edge case, cron failure, etc.), the friend shows as "Out Now" indefinitely.

The night_statuses query (line 93) correctly filters by `expires_at > now`, but the checkins query has no equivalent guard.

### Fix — `src/components/MyFriendsTab.tsx`

Add a time filter to the checkins query: only fetch checkins started within the last 24 hours (matching the pattern already used elsewhere in the app per the status-resolution-logic memory).

```typescript
// Line 91-92: Add 24h filter to checkins query
const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

supabase.from('checkins')
  .select('user_id, venue_name, started_at')
  .in('user_id', ids)
  .is('ended_at', null)
  .gt('started_at', twentyFourHoursAgo)
```

This ensures that even if the daily cleanup fails or misses a record, no checkin older than 24 hours will ever surface as "Out Now."

### Files changed
- `src/components/MyFriendsTab.tsx` — add `.gt('started_at', twentyFourHoursAgo)` to checkins query

