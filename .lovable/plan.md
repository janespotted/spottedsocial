

## Fix 3 Audit Issues

### 1. Add Missing DialogTitle (Accessibility)

**`src/components/PrivatePartyInviteModal.tsx`**
- Line 7: Add `DialogTitle` to the import from `@/components/ui/dialog`, add new import for `VisuallyHidden` from `@/components/ui/visually-hidden`
- Line 232 (inside `DialogContent`, as first child before the `<div className="p-5">`): Add `<VisuallyHidden><DialogTitle>Invite Friends to Party</DialogTitle></VisuallyHidden>`

**`src/components/InviteFriendsModal.tsx`**
- Line 8: Add `DialogTitle` to the import, add `VisuallyHidden` import
- Line 180 (inside `DialogContent`, as first child before the `<div className="p-5">`): Add `<VisuallyHidden><DialogTitle>Invite Friends</DialogTitle></VisuallyHidden>`

### 2. Improve Auto-Track Error Handling

**`src/lib/auto-venue-tracker.ts`**
- Lines 361-363: Replace the catch block. Check if error is a geolocation error (error.code === 1/2/3) or geolocation is unavailable or accuracy-related. If so, log at `console.debug` level. Otherwise log the actual `error.message` at `console.error`.

### 3. Add Map Profiles 403 Retry

**`src/pages/Map.tsx`**
- Lines 403-405: Change `const { data: allProfiles }` to `let { data: allProfiles, error: profilesError }`. After the call, check if `profilesError` contains a 403. If so, wait 1 second and retry the RPC once. Log the error if retry also fails.

