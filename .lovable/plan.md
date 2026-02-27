

## Pre-Launch Bug Fixes

### Fix 1: `useUserCity` event listener race condition
**File:** `src/hooks/useUserCity.ts`

The `cityChanged` event listener (lines 43-54) is unreachable. It's placed after two early-return branches (line 22 `return` and line 40 `return`), so it never registers. Move the event listener registration outside the conditional branches so it always runs.

### Fix 2: Yap "You're at" bar shows expired venues
**File:** `src/components/messages/YapTab.tsx`

The `fetchUserVenue` query (lines 58-63) fetches from `night_statuses` without checking `expires_at`. A user whose status expired at 5 AM will still see "You're at Chez Jay" the next day. Add `.not('expires_at', 'is', null).gt('expires_at', new Date().toISOString())` to the query.

### Fix 3: Messages tab loading flicker
**File:** `src/components/messages/YapTab.tsx`

The `isLoading` state resets to `true` on every `fetchQuotes` call (line 101), causing the skeleton to flash when switching tabs or when `city` changes. Only show skeleton on initial load; use a separate `isRefreshing` flag for subsequent fetches, or skip showing skeleton if `quotes` already has data.

### Changes Summary

| File | Change |
|---|---|
| `src/hooks/useUserCity.ts` | Move `cityChanged` event listener outside conditional branches so it always registers |
| `src/components/messages/YapTab.tsx` | Add `expires_at` filter to `fetchUserVenue` query; suppress skeleton flicker on refetches |

