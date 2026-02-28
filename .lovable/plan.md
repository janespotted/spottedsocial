

## Issue: "Location error - User denied geolocation"

This is a browser permission issue — when you tap "Yes I'm out", the app requests GPS access, and your browser is blocking it. The `LocationPermissionPrompt` component already exists but is never wired into the check-in flow.

### Fix

**Wire `LocationPermissionPrompt` into `CheckInModal.tsx`:**

1. Add state for `locationError` type and `showLocationPrompt` boolean
2. In the `captureAndDeriveVenue` catch block (line 218), when the error is a permission denial (code 1), set the location error state and show the prompt instead of just a toast
3. In `handleShareLocation` (line 465), also show the prompt on permission error instead of just a toast
4. Render `<LocationPermissionPrompt>` at the bottom of CheckInModal with an `onRetry` callback that re-triggers `captureAndDeriveVenue`

This gives users clear instructions on how to enable location access instead of a dismissible toast.

### Files changed
- `src/components/CheckInModal.tsx` — import and render `LocationPermissionPrompt`, add error state, wire catch blocks to show it

