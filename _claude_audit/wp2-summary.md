# WP2 Summary: Consolidate status transitions into shared helpers

## New file: `src/lib/night-status.ts`

Central module for all status transition writes. Exports:

### `getStatusExpiry(): string`
- Single implementation of the "next 5 AM" expiry calculation.
- Uses the user's detected city timezone via `getCachedCity()` from `city-detection.ts` and a `cityToTimezone()` mapping (`la` -> `America/Los_Angeles`, `nyc`/`pb`/default -> `America/New_York`).
- DST-safe via `Intl.DateTimeFormat` offset derivation (same technique as the old `calculateExpiryTime()`).
- Falls back to `America/New_York` when no city is cached.

### `must<T>(result: { data: T; error: any }): T`
- Throws on Supabase `error`, returns `data`. Used for every DB write in the helpers so that catch blocks actually fire on failures (fixes the "six files discard `{error}`" audit finding).

### `stopSharing(userId: string): Promise<void>`
- The ONE way to stop. Ordered for privacy (clears location first):
  1. `stopAllLocationTimers()` + `stopBackgroundLocation()`
  2. `clearUserLocation(userId)` (removes user from map)
  3. End open check-ins (`ended_at = now`)
  4. Full-field `night_statuses` upsert: `status: 'home'`, all venue/party/planning fields null, `expires_at: null`
- Standardizes on `'home'` status (previously half the paths wrote `'off'`).

### `goOutAtVenue(userId, opts): Promise<void>`
- The ONE way to go out at a venue. Options:
  - `venue: { id, name }` — the venue
  - `coords?: { lat, lng }` — GPS coordinates (omitted = no lat/lng written, never 0,0)
  - `source?: string` — `'manual'` or `'arrival'` triggers `markManualCheckin()`
  - `privateParty?: { neighborhood, address? }` — sets `is_private_party: true`
- Full-field NS upsert (status `'out'`, all planning/party fields explicitly handled).
- Ends prior check-ins, inserts new one, updates profile (`is_out: true`, GPS).
- Never writes `location_sharing_level` (WP7).

### `goPlanning(userId, opts?): Promise<void>`
- The ONE way to enter planning mode.
- Ends open check-ins (bug fix: previously missing from QuickStatusSheet and PlansFeed).
- Clears user location from map.
- Full-field NS upsert with `status: 'planning'`, optional `neighborhood`/`visibility`.

### `stopAllLocationTimers()` / `registerLocationTimer(cleanup)`
- Module-level registry of cleanup functions. Any stop path can kill all registered timers.
- CheckInModal's 60s interval is registered here.

---

## Files modified

### `src/lib/time-utils.ts`
- Replaced the inline `calculateExpiryTime()` implementation with a re-export alias of `getStatusExpiry` from `night-status.ts`. Keeps the import name stable for any callers not migrated in this WP. `isExpired()` left unchanged.

### `src/lib/auto-checkout.ts`
- `performAutoCheckout()` now delegates all cleanup to `stopSharing()` and just logs the `auto_checkout_stale` event. Removed direct `supabase`, `clearUserLocation`, and `stopBackgroundLocation` imports.

### `src/components/QuickStatusSheet.tsx`
- Removed inline `getExpiryTime()` function.
- `handleGoLive` (with suggested venue): replaced inline NS upsert + checkin + profile writes with `goOutAtVenue()`.
- `handlePlanning`: replaced inline NS upsert + `clearUserLocation()` with `goPlanning()`. **Bug fix**: now ends open check-ins (audit P1-1: friends saw you "out" in InviteFriendsModal after switching to TBD).
- `handleStayingIn`: replaced inline NS upsert + checkin end + location clear with `stopSharing()`.
- `handleStopSharing`: replaced inline NS upsert + checkin end + location clear with `stopSharing()`.
- Both stop handlers now use `status: 'home'` instead of `'off'`.

### `src/components/UpdateSpotSheet.tsx`
- `switchToVenue()`: replaced inline checkin end + insert + NS update + profile update with `goOutAtVenue()`. **Bug fix**: now sets `status: 'out'` and refreshes `expires_at` (audit P1-1/P3 rows 10-11). **Bug fix**: no longer writes `lat: 0, lng: 0` when GPS unavailable (Null Island fix from audit).
- `handleCustomVenue()`: replaced inline writes with `goOutAtVenue()` using `privateParty` option. Neighborhood detection preserved at call site.
- `handleStopSharing()`: replaced with `stopSharing()`.

### `src/pages/Map.tsx`
- Venue move banner `onAccept`: replaced inline checkin/NS/profile writes with `goOutAtVenue()`. **Bug fix**: now sets `status: 'out'` and refreshes `expires_at`.
- Stop sharing button: replaced inline NS upsert + checkin end + `clearUserLocation()` with `stopSharing()`. Now sets `status: 'home'` instead of `'off'`.

### `src/components/VenueArrivalPrompt.tsx`
- `handleConfirm()`: replaced inline expiry calc + checkin end + insert + NS upsert + profile update with `goOutAtVenue()` (source: `'arrival'`). Notification/analytics code preserved at call site.

### `src/hooks/useVenueArrivalNudge.ts`
- `silentVenueUpdate()`: replaced inline checkin/NS/profile writes with `goOutAtVenue()` (source: `'venue_shift'`). Still-here timer reset preserved at call site.

### `src/lib/auto-venue-tracker.ts`
- `createCheckin()`: replaced inline checkin end + insert + NS update + profile update with `goOutAtVenue()` (source: `'auto'`). Gating logic in `autoTrackVenue()` preserved. **Bug fix**: now sets `status: 'out'` and refreshes `expires_at` on auto venue changes.

### `src/components/PlansFeed.tsx`
- `handleJoinPlanning()`: replaced inline 5am calc + NS upsert with `goPlanning()`. **Bug fix**: now ends open check-ins and clears GPS location.
- `handleLeavePlanning()`: replaced inline NS update (`status: 'off'`) with `stopSharing()`. **Bug fix**: now ends check-ins, clears location, and resets all venue/party/planning fields (previously only flipped status).

### `src/components/DailyNudgeModal.tsx`
- Replaced inline `getExpiryTime()` function and NS upsert with `goPlanning()` (for planning responses) and `stopSharing()` (for staying-in responses). Daily nudge record upsert and navigation preserved at call site.

### `src/pages/DemoSettings.tsx`
- Replaced inline 5am expiry calculation with `getStatusExpiry()`. Rest of demo seed logic untouched.

### `src/hooks/useCheckInPrompt.ts`
- Updated guard at line 33: now treats both `'home'` and `'off'` as inactive statuses (`data.status !== 'home' && data.status !== 'off'`). This ensures the check-in prompt still fires for users with legacy `'off'` status rows during the transition period.

### `src/components/CheckInModal.tsx`
- Replaced `clearUserLocation` import with helpers from `night-status.ts`.
- Removed `calculateExpiryTime` and `markManualCheckin` imports (now handled internally by helpers).
- `startLocationTracking()`: registered the 60s interval with `registerLocationTimer()` so any stop path can kill it.
- `stopLocationTracking()`: removed the `clearUserLocation()` call (now handled by `stopSharing()`). Changed from `async` to sync since it no longer awaits anything.
- Home branch (status selector): calls `stopSharing()` instead of `updateStatus('home', ...)`.
- `handleVenueConfirm` custom venue flow: replaced inline NS upsert with `goOutAtVenue()` using `privateParty` option.
- `handleVenueConfirm` DB venue flow: profile update narrowed to just `location_sharing_level` (marked `// WP7`), since `goOutAtVenue()` now handles `is_out` and GPS fields.
- `updatePrivatePartyStatus()`: replaced inline NS upsert + profile update with `goOutAtVenue()` using `privateParty` option. `location_sharing_level` write preserved with `// WP7` comment.
- `updateStatus()` rewritten:
  - `'out'`: delegates to `goOutAtVenue()`, then runs notification/logging code at call site.
  - `'home'`: delegates to `stopSharing()`.
  - `'planning'`: delegates to `goPlanning()`, then runs planning notification code at call site.
  - `'heading_out'`: kept as inline NS upsert (not covered by the three main helpers; uses `getStatusExpiry()` and `must()` for consistency).

---

## Bug fixes included

| Audit ref | Description | Fix |
|-----------|-------------|-----|
| P1-1 | QuickStatusSheet TBD doesn't end open check-ins, so friends still see you "out" in InviteFriendsModal | `goPlanning()` always ends check-ins |
| P1-1 | PlansFeed join-planning leaves GPS + open check-in | `goPlanning()` clears location and ends check-ins |
| P1-1/P3 rows 10-11 | UpdateSpotSheet switchToVenue / Map move banner don't set `status:'out'` or refresh `expires_at` | `goOutAtVenue()` does full-field NS upsert |
| P0-6 client | Stale party address leak when stopping | `stopSharing()` nulls all party fields |
| P1-10 | Half the stop paths write `'off'` + future expiry; readers treat `'off'` and `'home'` differently | All stop paths now write `'home'` + null expiry; `useCheckInPrompt` treats both identically |
| Null Island | UpdateSpotSheet writes `lat: 0, lng: 0` when GPS unavailable | `goOutAtVenue()` omits lat/lng when coords are null |
| Dead catches | Six files `await` Supabase calls and discard `{error}` | All helper writes go through `must()` which throws on error |
| Leave-planning | PlansFeed `handleLeavePlanning` only flips status, clears nothing | Now uses `stopSharing()` which does full cleanup |

---

## Verification results

1. `npm run build` -- clean (no errors)
2. `npx tsc --noEmit` -- clean (no errors)
3. Grep: zero remaining inline `night_statuses` upserts/updates in `src/` outside:
   - `night-status.ts` (the helpers themselves)
   - `CheckInModal.tsx` line 900 (`heading_out` -- acceptable, not one of the three main flows)
   - `DemoActivator.tsx` (demo function, WP5 constraint)
   - `Profile.tsx` line 363 (`planning_visibility` toggle -- explicitly allowed)
4. Grep: zero remaining inline 5am calculations for night_status expiry. Remaining `setHours(5,0,0,0)` instances are in event/plan contexts (CreateEventDialog, EditPlanDialog, ActivityTab, etc.), not night status.

## Not changed (per constraints)

- Notification recipient logic (WP4)
- Background-location internals beyond `stopBackgroundLocation()` export (WP3)
- Demo functions in `DemoActivator.tsx` / `demo-data.ts` (WP5)
- RLS policies (WP6)
- CommentsSheet / keyboard handling (CLAUDE.md)
- `clearUserLocation()` left as-is; helpers compose it
- `location_sharing_level` writes preserved with `// WP7` comments in CheckInModal (too entangled with share-option UI)
