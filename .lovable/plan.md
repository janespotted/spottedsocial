

## Location Staleness + Auto-Expire System

### Overview
Four changes: (1) staleness-aware rendering on the Map, (2) remove background-skip in auto-tracker and instead trigger on foreground return, (3) 60-second heartbeat for active "out" users, (4) "Last seen" timestamps in the friends list.

---

### 1. `src/pages/Map.tsx` — Staleness-aware rendering

**FriendLocation interface** — add `last_location_at?: string` field.

**Data fetch** (`fetchFriendsLocations`, ~line 527) — include `last_location_at` from the profile data when building `friendLocations`:
```typescript
last_location_at: friend.last_location_at || null,
```

**Helper function** — add a `getStalenessMins` utility:
```typescript
const getStalenessMins = (lastLocationAt?: string | null): number => {
  if (!lastLocationAt) return 999;
  return (Date.now() - new Date(lastLocationAt).getTime()) / 60000;
};

const formatLastSeen = (mins: number): string => {
  if (mins < 5) return 'Now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  return `${Math.round(mins / 60)}h ago`;
};
```

**Marker rendering** (~line 753, the `useEffect` for friend markers):
- Before clustering, split `filteredFriends` into:
  - `activeFriends` (staleness < 60 min) — render markers on map
  - Friends > 60 min stale — skip marker rendering entirely
- For 15–60 min stale friends, set marker element opacity to 0.5 via `el.style.opacity = '0.5'`

**Friends list drawer** (~line 1941):
- Show ALL friends (including >60 min stale), but gray out stale ones
- After the venue name line, add a "Last seen" label using `formatLastSeen`
- For >60 min stale: dim the entire row with `opacity-50` and show "Last seen Xh ago" in muted text
- For 15–60 min: show "Last seen X min ago" in muted text
- For <15 min: show nothing (or "Now")

**Search overlay friends** (~lines 1769, 1798): same staleness label treatment.

### 2. `src/lib/auto-venue-tracker.ts` — Remove background skip, add foreground trigger

**Remove lines 276-281** (the `wasInBackground` early return block). The speed check and nightlife zone check that follow are sufficient guards.

**Modify the `visibilitychange` listener** (~line 53): instead of just setting `wasInBackground = true` when hidden, also trigger tracking when becoming visible:
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    trackingState.wasInBackground = true;
  } else {
    // App returned to foreground — bypass debounce and re-check
    trackingState.lastTrackTime = 0; // Reset debounce so next call proceeds
  }
});
```

This way, when `autoTrackVenue` is called after a foreground return (via `useVisibilityRefresh` or `useAutoVenueTracking`), it won't be debounced. The existing speed check (>12 mph skip) and nightlife zone check still protect against false updates.

**Remove `trackingState.wasInBackground` field** and all remaining references — it's no longer needed.

### 3. `src/hooks/useAutoVenueTracking.ts` — 60-second heartbeat

Add a heartbeat interval that runs every 60 seconds when the user is "out":

- After the existing `useEffect`, add a second `useEffect` that:
  1. Checks if the user has an active night status of "out" (query `night_statuses` once on mount)
  2. If out, starts a 60-second `setInterval`
  3. Each tick: gets current GPS via `navigator.geolocation.getCurrentPosition`, then updates `profiles.last_known_lat/lng/last_location_at` and `checkins.last_updated_at` (where `ended_at IS NULL`)
  4. Cleans up interval on unmount or when user is no longer out

- Also listen for `visibilitychange` — pause heartbeat when hidden, resume + immediately fire when visible again (to catch up after backgrounding). On foreground return, also call `autoTrackVenue(user.id)` bypassing debounce.

```typescript
useEffect(() => {
  if (!user) return;
  let intervalId: NodeJS.Timeout | null = null;
  let cancelled = false;

  const heartbeat = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      const now = new Date().toISOString();
      await Promise.all([
        supabase.from('profiles').update({
          last_known_lat: pos.coords.latitude,
          last_known_lng: pos.coords.longitude,
          last_location_at: now,
        }).eq('id', user.id),
        supabase.from('checkins').update({
          last_updated_at: now,
        }).eq('user_id', user.id).is('ended_at', null),
      ]);
    } catch { /* GPS unavailable, skip */ }
  };

  const start = async () => {
    // Check if user is currently "out"
    const { data } = await supabase
      .from('night_statuses')
      .select('status')
      .eq('user_id', user.id)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (cancelled || data?.status !== 'out') return;
    heartbeat(); // immediate first tick
    intervalId = setInterval(heartbeat, 60000);
  };

  start();
  return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
}, [user]);
```

**RLS note**: The `checkins` table currently has no UPDATE policy for users. A migration is needed to add one:
```sql
CREATE POLICY "Users can update own checkins"
  ON public.checkins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 4. Database migration

Add UPDATE policy on `checkins` so the heartbeat and auto-tracker can update `last_updated_at`:
```sql
CREATE POLICY "Users can update own checkins"
  ON public.checkins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

### Files changed
- `src/pages/Map.tsx` — staleness display logic for markers + friends list + search
- `src/lib/auto-venue-tracker.ts` — remove background skip, reset debounce on foreground
- `src/hooks/useAutoVenueTracking.ts` — add 60s heartbeat interval for "out" users
- Database migration — add UPDATE policy on `checkins`

