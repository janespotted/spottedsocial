

# Fix Push Notifications: Align App Identity + Strengthen Token Refresh

## Problem
- `capacitor.config.ts` has `appId: 'com.spotted.app'` but the iOS project uses `com.janereynolds.spotted` -- this mismatch causes APNs token/topic conflicts
- Token registration only runs on initial mount, not on app resume from background

## Changes

### 1. Update `capacitor.config.ts` (line 4)
Change `appId` from `'com.spotted.app'` to `'com.janereynolds.spotted'`

### 2. Strengthen token refresh in `src/App.tsx` AutoTracker component

Extract the push registration logic into a reusable `registerPushToken` function. Then:

- Call it on mount (existing behavior, in the `[user]` effect)
- Add a **new effect** that listens for `visibilitychange` and Capacitor `appStateChange` events to re-run `registerPushToken` when the app comes to foreground
- Add a throttle (e.g. 60s) to avoid spamming registration on rapid tab switches
- Enhanced logging in the registration listener:
  - Log `tokenPrefix` (first 8 chars), `tokenLength`, `userId` prefix on token received
  - Log confirmation with `tokenPrefix` and `userId` on successful save
  - Log explicit failure details on save error

### Technical Detail

The foreground resume listener will use Capacitor's `App.addListener('appStateChange')` for native and `document.addEventListener('visibilitychange')` for web. Both will call the same `registerPushToken(user)` function with the 60-second throttle guard.

