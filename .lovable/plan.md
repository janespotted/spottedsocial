

## Bug Analysis

### Issue 1: Yap shows wrong venue after check-in

**Root cause:** The `YapTab` reads `userVenueName` from `night_statuses.venue_name` (line 60-67 of YapTab.tsx) — this is correct. However, it only fetches this once when the directory view loads (`useEffect` on line 51-55 triggers `fetchQuotes` which queries `night_statuses`). If the user checks in on a different tab and then switches to Yap, the data is already cached in component state and doesn't refresh.

Additionally, the "You're at" bar and the `canPost` check both use this stale `userVenueName` state.

**Fix in `src/components/messages/YapTab.tsx`:**
- Add a separate `useEffect` that re-fetches the user's current venue from `night_statuses` whenever the component mounts or the `user` changes — independent of the full quotes fetch.
- Use a Supabase realtime subscription on `night_statuses` filtered to the current user, so when a check-in updates `venue_name`, the Yap tab reflects it immediately without needing a full refresh.

### Issue 2: `autoTrackVenue` can silently overwrite confirmed venue

**Root cause:** `autoTrackVenue` in `src/lib/auto-venue-tracker.ts` has no concept of "user-confirmed" check-ins. After a user manually confirms a venue in CheckInModal, `autoTrackVenue` can fire on the next screen navigation (30s debounce) and overwrite `night_statuses.venue_name` and create a new checkin if the user has moved >200m.

**Fix in `src/lib/auto-venue-tracker.ts`:**
- Before auto-updating, check if the last checkin was created recently (within 30 minutes) AND has no `source` marker. We'll add a guard: read the `last_updated_at` of the active checkin — if it was updated within the last 30 minutes by a manual check-in, skip auto-tracking.
- Simpler approach: store a `lastManualCheckinTime` in the tracking state. Export a `markManualCheckin()` function that sets this timestamp.
- In `autoTrackVenue`, skip if `Date.now() - lastManualCheckinTime < 30 * 60 * 1000` (30 min cooldown after manual check-in).

**Fix in `src/components/CheckInModal.tsx`:**
- After a successful venue confirmation, call `markManualCheckin()` to set the cooldown.

### Changes Summary

| File | Change |
|---|---|
| `src/components/messages/YapTab.tsx` | Re-fetch `userVenueName` from `night_statuses` on mount/focus; add realtime subscription for live updates |
| `src/lib/auto-venue-tracker.ts` | Add `lastManualCheckinTime` to tracking state; export `markManualCheckin()`; add 30-min cooldown guard in `autoTrackVenue` |
| `src/components/CheckInModal.tsx` | Call `markManualCheckin()` after successful venue confirmation |

