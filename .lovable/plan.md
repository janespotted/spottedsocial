

# Demo Mode: Populate "Who's Going Out Tonight" and Leaderboard Avatars

## Problem 1: Empty "Who's Going Out Tonight" on Home

The Home page's `fetchPlanningFriends` always queries through real friendships, even in demo mode. The Map page already has a demo shortcut that fetches planning demo users directly from `night_statuses` -- but Home doesn't have this logic. Result: 0 planning friends shown on Home in demo mode.

## Problem 2: No friend avatars on leaderboard venues

The seed function spreads 5 "out" demo users across different venues (1 per venue). So each venue shows at most 1 avatar. To make the leaderboard look alive, we need to cluster multiple demo users at key venues so avatars stack up.

---

## Fix 1: Home page demo shortcut for planning friends

**File: `src/pages/Home.tsx`**

Add a demo-mode branch to `fetchPlanningFriends` (mirroring what Map.tsx already does at lines 235-245):

- When `demoEnabled` is true, skip the friendship query
- Directly fetch `night_statuses` with `status='planning'` and `profiles.is_demo = true`
- Map results to the same `PlanningFriend` shape and set state
- Return early, skipping normal friendship-based logic

## Fix 2: Seed more demo users at key venues for leaderboard

**File: `supabase/functions/seed-demo-data/index.ts`**

Currently creates 12 demo users total, puts 5 at venues (1 each). Change to:

- Increase "out" users to 8 (from 5), with some users sharing venues so avatars cluster
- Specifically place 2-3 users at the top-ranked venue (Le Bain for NYC) so the leaderboard row shows a stack of friend avatars
- Keep 3 users in "planning" status for the "Who's Going Out Tonight" section (already done, these will now actually show on Home)

---

## Summary

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Add demo-mode branch in `fetchPlanningFriends` to directly query demo planning statuses (skip friendship lookup) |
| `supabase/functions/seed-demo-data/index.ts` | Cluster more demo users at top venues so leaderboard shows stacked friend avatars |

## Expected Result

- Home page "Who's Going Out Tonight" shows 3 demo users with neighborhoods in demo mode
- Leaderboard venues show 2-3 stacked friend avatars at top venues (especially Le Bain)
- Map continues working as before (already had demo shortcut)
