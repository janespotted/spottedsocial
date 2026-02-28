

## Fix: Plans not showing + "Yap about it" button not working

### Issue 1: Plans expire immediately after creation (UTC/local time bug)

**Root Cause**: `CreatePlanDialog.tsx` line ~149-152 calculates `expires_at` using `new Date(planDate)` which creates a UTC midnight date, then applies `setHours(5, 0, 0, 0)` in local time. For users in US timezones (UTC-5 to UTC-8), this creates an expiry time that's already in the past when the plan is posted at night.

Example for a PST user posting at 11pm on Feb 27:
- `new Date("2026-02-27")` = Feb 26 4:00 PM PST (UTC midnight)
- `+1 day` = Feb 27 4:00 PM PST
- `setHours(5,0,0,0)` = Feb 27 5:00 AM PST — already 18 hours in the past

**Fix**: Replace the UTC date constructor with a local date constructor:
```js
const [year, month, day] = planDate.split('-').map(Number);
const expiresAt = new Date(year, month - 1, day + 1, 5, 0, 0, 0);
```

**File**: `src/components/CreatePlanDialog.tsx`

---

### Issue 2: "Yap about it" button not navigating for private party

**Root Cause**: The `handleShareClick` in `CheckInConfirmation.tsx` calls `closeCheckInConfirmation()` which triggers a React state update. The `navigate` call runs after, but the component's state change and the navigation happen in the same tick. The real problem is that the navigation state `{ venueName: checkInVenueName }` may not match the `userVenueName` in `YapTab`, because:
- The check-in name from the confirmation is e.g. `"Private Party (Hollywood Hills)"`
- But `YapTab` reads `userVenueName` from `night_statuses` which builds the name differently: `"Private Party · Hollywood Hills"` (using `·` instead of parentheses)

So `isCheckedInHere` (YapTab line 224) is `false`, the thread opens but with `canPost=false`, and there are no existing yaps to show — making it look like nothing happened.

Additionally, the button may not respond on mobile due to the `onClick` on the backdrop parent intercepting touch events before they reach the button.

**Fix (two parts)**:

1. **`CheckInConfirmation.tsx`**: Use `e.stopPropagation()` on the button to prevent backdrop interference, and navigate first then close to ensure navigation completes.

2. **`CheckInConfirmation.tsx`**: Pass the venue name through navigation state in a normalized way, OR fix the name format mismatch. The simplest fix: pass a `isPrivateParty` flag through the navigation state and let YapTab use the `userVenueName` it already has.

**Files**: `src/components/CheckInConfirmation.tsx`, `src/components/messages/YapTab.tsx`

---

### Summary of changes
- `src/components/CreatePlanDialog.tsx` — fix expires_at calculation to use local time constructor
- `src/components/CheckInConfirmation.tsx` — fix "Yap about it" button event handling and private party name mismatch
- `src/components/messages/YapTab.tsx` — handle navigation state for private party yap thread opening (match against `userVenueName` when it becomes available)

