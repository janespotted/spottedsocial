
# Fix: "Who's Going Out Tonight" Empty in Demo Mode (PlansFeed)

## Root Cause

The `PlansFeed.tsx` component's `fetchPlanningFriends` function has no demo-mode-specific logic. It:
1. Queries friendships, then checks `night_statuses` for `status='planning'`
2. Looks up profiles from a React Query cache (`queryClient.getQueryData(['profiles-safe'])`)

Demo profiles are not in that cache, so even though the seed function creates 4 planning statuses for demo users, their profiles are never found and the list stays empty.

Meanwhile, `Home.tsx` already has the correct pattern -- a demo mode shortcut that directly queries `night_statuses` where `is_demo=true` and `status='planning'`, then fetches profiles directly from the database.

## Fix

**File: `src/components/PlansFeed.tsx`**

Add a demo mode shortcut to `fetchPlanningFriends` (same pattern as `Home.tsx`):

```typescript
const fetchPlanningFriends = async () => {
  if (!userId) return;
  
  try {
    // Demo mode shortcut: directly query demo planning statuses
    if (demoEnabled) {
      const { data: demoStatuses } = await supabase
        .from('night_statuses')
        .select('user_id, planning_neighborhood')
        .eq('status', 'planning')
        .eq('is_demo', true)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString());

      if (!demoStatuses || demoStatuses.length === 0) {
        setPlanningFriends([]);
        // still fetch user status below...
      } else {
        const demoUserIds = demoStatuses.map(s => s.user_id);
        const neighborhoodMap = new Map(demoStatuses.map(s => [s.user_id, s.planning_neighborhood]));
        const { data: demoProfiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', demoUserIds);

        setPlanningFriends((demoProfiles || []).map((p: any) => ({
          user_id: p.id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          planning_neighborhood: neighborhoodMap.get(p.id) || null,
        })));
      }
      // Still need to fetch user's own status
      // (keep existing user status/profile fetch)
      return;
    }
    
    // ... existing non-demo logic unchanged
  }
};
```

The user's own planning status and profile fetch (lines 99-121) should still run regardless, so we keep that part and only shortcut the friends portion.

## Summary

| File | Change |
|------|--------|
| `src/components/PlansFeed.tsx` | Add demo mode shortcut in `fetchPlanningFriends` to directly query demo planning statuses and profiles from DB instead of relying on cache |

## Expected Result

In demo mode, the "Who's Going Out Tonight" section will show 4 demo users with their planning neighborhoods, matching what already works on the Home page.
