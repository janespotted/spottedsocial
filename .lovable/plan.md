

## Problem

The push notification toggle doesn't appear at all because `isSupported` evaluates to `false` in the Lovable preview iframe. The preview runs in a sandboxed cross-origin iframe where Service Workers and PushManager are unavailable, so the code renders "Browser not supported" instead of the Switch.

This same issue may happen on some mobile browsers. The toggle should always be visible and explain the situation on tap, rather than being hidden.

## Fix

**`src/hooks/usePushNotifications.ts`** — Always report `isSupported = true` on web (since PWA push is broadly supported), and handle failures gracefully at subscribe time instead of hiding the UI.

**`src/pages/Settings.tsx`** — Always render the Switch (remove the `isSupported` gate). If subscribe fails because the browser doesn't actually support it, show a toast explaining why.

| File | Change |
|------|--------|
| `src/hooks/usePushNotifications.ts` | Change `isSupported` to always be `true` on web (non-native), and catch unsupported errors in `subscribe()` |
| `src/pages/Settings.tsx` | Always render the Switch toggle, remove `!isSupported` fallback text. Handle errors via toast on toggle |

