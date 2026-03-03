

## Plan: Fix greyed-out push notification toggle

### Root Cause
The Switch is `disabled={isLoading || isToggling}`. Even with the timeout fix, `isLoading` can stay `true` if `checkSubscription` hasn't resolved yet (e.g., slow SW init on PWA). The toggle should not be blocked by the initial subscription check — only by an active toggle action.

### Fix
**`src/pages/Settings.tsx`** — Change `disabled` prop from `isLoading || isToggling` to just `isToggling`. This way the toggle is always interactive once rendered; only the active subscribe/unsubscribe action disables it momentarily. The initial loading state (`isLoading`) should not prevent interaction.

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` (line 148) | Change `disabled={isLoading \|\| isToggling}` to `disabled={isToggling}` |

Single-line fix, no other files or DB changes needed.
