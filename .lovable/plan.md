

# Smooth Venue Switching & Planning-to-Out Transition

## Current State Summary

The system already has:
- A **status pill** on the map (lines 1282-1348 of Map.tsx) showing "Out · Venue", "Planning", or "In" that opens `QuickStatusSheet`
- A **venue arrival nudge system** (`useVenueArrivalNudge` hook) that auto-detects venues via GPS polling and either silently updates venue (toast for "out" users) or shows a modal (for planning/no-status users)
- A **smart prompt banner** (lines 1247-1280) for planning users near a venue, showing "Looks like you're at [Venue]" with a "Share Location" button
- `QuickStatusSheet` — a drawer with "Yes I'm out", "Planning on it", "Staying in", and "Stop Sharing" options, but NO venue switching capability
- `CheckInModal` — the full "Are you out?" flow with privacy selection and venue detection

What's **missing**:
1. **No manual venue-switch UI** — QuickStatusSheet doesn't show nearby venues when user is already "out"
2. **No gentle GPS-drift banner** — the venue arrival nudge for "out" users auto-updates silently via toast; there's no interactive banner asking "Moved to a new spot?"
3. **No planning-to-out banner** — the smart prompt exists but only for users near a venue; there's no general "Ready to go?" prompt for planning users opening the app

## Changes

### 1. New Component: `UpdateSpotSheet.tsx`
A bottom sheet specifically for venue switching while already "out". This replaces the QuickStatusSheet when the user taps the status pill while status is "out".

**Contents:**
- Title: "Update your spot 📍"
- Nearby venues list (top 5 from GPS, via `findNearbyVenues` RPC) ordered by distance
- Search bar to find a venue by name (queries `venues` table)
- "Somewhere else" option (opens text input for custom venue name)
- "Stop sharing" option at the bottom
- Tapping a venue: instant one-tap update — closes sheet, updates `night_statuses`, `checkins`, `profiles`, shows toast "📍 Now at [Venue Name]"

**No privacy re-selection** — user already chose privacy when they went live. Just update the venue.

### 2. Modify Status Pill Tap Behavior (`Map.tsx`)
Currently, tapping the status pill always opens `QuickStatusSheet`.

Change: When `currentUserStatus === 'out'`, open the new `UpdateSpotSheet` instead. When status is anything else, keep opening `QuickStatusSheet` as before.

### 3. New Component: `VenueMoveBanner.tsx`
A thin, non-intrusive banner at the top of the map screen. Shown when:
- User status is "out"
- GPS detects they are >200m from their current venue
- They are within 500m of a different venue in the database

**Layout:** Single-line bar: "Moved to a new spot? 📍" with buttons: "[Venue Name]" and "Dismiss". Small "or somewhere else →" link if multiple nearby venues (opens UpdateSpotSheet).

**Behavior:**
- Tap venue name → instant update, toast "📍 Now at [Venue]", banner disappears
- Tap "Dismiss" → banner disappears, does NOT reappear until user moves another 200m+
- Auto-dismiss after 10 seconds
- Non-blocking — user can interact with map normally while it's showing

### 4. New Component: `PlanningReadyBanner.tsx`
A thin banner at the top of the map screen for planning users. Shown ONCE per session.

**Layout:** "Ready to go? 🎉" with buttons: "I'm out" and "Not yet"

**Behavior:**
- "I'm out" → Opens the full CheckInModal privacy selection flow (same as initial "Yes I'm out" path), then venue detection
- "Not yet" → dismisses, doesn't come back until next app session
- Only shown when `currentUserStatus === 'planning'` and session flag not set

### 5. Integrate into `Map.tsx`
Add state and rendering for the two new banners:
- `showVenueMoveBanner` + `moveVenue: { id, name }` state — set by the venue arrival nudge system
- `showPlanningReadyBanner` state — set once per session for planning users
- Stack banners below the existing header and search bar, above the status pill
- The venue move detection logic can piggyback on the existing `useVenueArrivalNudge` hook — modify it to expose a "venue shift detected" callback instead of auto-updating for "out" users

### 6. Modify `useVenueArrivalNudge` Hook
Currently, when a user is "out" and near a new venue, it auto-updates silently with a toast. Change to:
- Instead of silently updating, call a callback to show the `VenueMoveBanner` on the map
- Add a new context/callback mechanism: `onVenueShiftDetected(venue)` that Map.tsx can use to show the banner
- Keep the dwell time, GPS accuracy, and re-entry gates unchanged
- The banner-based flow replaces the toast-only flow for "out" users

### 7. Language Audit
Search for any instance of "check in" in UI-facing strings across the codebase and replace with the approved alternatives:
- "Update your spot" (venue switch sheet)
- "Where are you?" (venue selection)
- "Moved to a new spot?" (gentle nudge)
- "Now at [Venue]" (confirmations)
- "📍" pin emoji throughout

**Note:** The words "checkin" and "check-in" in code identifiers (variable names, table names, function names) stay as-is — only user-facing strings change.

## Files Modified/Created

| File | Action |
|------|--------|
| `src/components/UpdateSpotSheet.tsx` | **NEW** — venue switch bottom sheet |
| `src/components/VenueMoveBanner.tsx` | **NEW** — gentle GPS nudge banner |
| `src/components/PlanningReadyBanner.tsx` | **NEW** — planning-to-out prompt |
| `src/pages/Map.tsx` | **EDIT** — integrate banners, change status pill tap behavior |
| `src/hooks/useVenueArrivalNudge.ts` | **EDIT** — expose venue shift callback instead of auto-toast for "out" users |
| `src/components/QuickStatusSheet.tsx` | **MINOR EDIT** — no functional changes, just ensure language consistency |
| `src/components/CheckInModal.tsx` | **MINOR EDIT** — language audit on UI strings |

## What Stays Untouched
- Initial "Are you out?" → "Share location" → "Venue selection" flow
- 5am auto-expire
- "X friends out" counter
- Map pins, relationship key, bottom navigation
- All venue arrival nudge gates (GPS accuracy, dwell time, re-entry)
- Database schema — no migrations needed

