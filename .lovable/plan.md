

## Plan: Prevent Self-Down on Own Plans + Show "Down" Activity + Down Users Popup

### Three changes needed:

**1. `src/components/PlanItem.tsx` — Hide "I'm Down" pill for plan owner**

On line ~511, wrap the "I'm Down" button so it only renders when `!isOwner`. The owner already has edit/delete controls; they shouldn't be able to mark themselves as "down" for their own plan.

Additionally, make the down count clickable: when tapping "X down", show a dialog/popup listing all users who are down (avatar + name), each clickable to open their friend ID card.

**2. `src/components/messages/ActivityTab.tsx` — Add `plan_down` to notification fetch**

On line 197, add `'plan_down'` to the `.in('type', [...])` array so plan_down notifications show up in the Activity Center. Add mapping logic (around line 243) to handle the `plan_down` type — display it as a standalone activity with the sender's name and message.

The Activity `type` union (line 28) needs `'plan_down'` added.

### No database changes needed
- `plan_down` notifications are already being created via `create_notification` RPC in PlanItem.tsx
- The `notifications` table already stores them

| File | Change |
|------|--------|
| `src/components/PlanItem.tsx` | Hide "I'm Down" button when `isOwner`; add a dialog showing all down users when clicking the down count |
| `src/components/messages/ActivityTab.tsx` | Add `plan_down` to notification type filter and activity type mapping |

