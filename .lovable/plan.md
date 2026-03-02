

## Fix: Duplicate Notifications in Activity Tab

### Root Cause
`ActivityTab.tsx` has **two identical `useEffect` hooks** (lines 133-137 and 626-631) with the same dependencies `[user, demoEnabled, bootstrapEnabled, city]` that both call `fetchAll()`. This causes the entire fetch pipeline to run twice, and since check-ins and DMs are merged via `setActivities(prev => [...prev, ...new])`, they accumulate duplicates.

### Additional Issue
The ActivityTab's notification query (line 165) does not filter by the 5am boundary, so old notifications from previous nights still appear (the DB still has Feb 28 entries).

### Changes

**`src/components/messages/ActivityTab.tsx`**:
1. Remove the duplicate `useEffect` at lines 626-631 — merge `fetchPlanningFriends()` into the single existing effect at line 133
2. Add `isFromTonight` filter to the notifications query results (line 179) so stale notifications from prior nights are excluded, matching what we did in `NotificationsContext`

