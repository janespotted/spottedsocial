

## Plan: Fix greyed-out push notification toggle

### Root Cause

In `usePushNotifications.ts`, `checkSubscription()` awaits `navigator.serviceWorker.ready` on the web path. This promise **hangs indefinitely** if the service worker hasn't registered yet (race condition with `main.tsx` registration) or can't register (preview iframe sandboxing). Since `isLoading` starts as `true` and only becomes `false` after `checkSubscription` completes, the Switch stays disabled forever.

### Fix

**`src/hooks/usePushNotifications.ts`** — Add a timeout wrapper around `navigator.serviceWorker.ready` so the check doesn't hang:

- Wrap the `navigator.serviceWorker.ready` call with a `Promise.race` against a 3-second timeout
- If the timeout fires, treat it as "no subscription" (set `isSubscribed = false`, `isLoading = false`)
- Also apply the same timeout pattern in `subscribe()` and `unsubscribe()` where `navigator.serviceWorker.ready` is called

This is a single-file fix — no other files or DB changes needed.

| File | Change |
|------|--------|
| `src/hooks/usePushNotifications.ts` | Wrap all `navigator.serviceWorker.ready` calls with a 3-second timeout to prevent hanging |

