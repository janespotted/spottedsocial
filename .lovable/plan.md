

# Fix: Edge Function Bundle Timeout

## Problem
The `seed-demo-data` edge function is **2020 lines** and timing out during bundle generation. The large venue arrays (NYC, LA, Palm Beach ~300 lines total) plus all the seeding logic makes it too heavy for the bundler.

## Solution
Reduce the file size by trimming venue lists to only essential entries and removing redundant data.

---

## Technical Changes

### 1. Reduce Venue Arrays (saves ~150 lines)

**NYC_VENUES**: Keep top 20 only (currently has 34)
**LA_VENUES**: Keep top 25 only (currently has 40)  
**PB_VENUES**: Keep top 15 only (currently has ~25)

This still provides enough variety for demo purposes while cutting ~100+ lines.

### 2. Simplify Demo User Data (saves ~50 lines)

Currently there are 50 demo user entries with descriptions. Reduce to 25 core users - still plenty for realistic social graph.

### 3. Consolidate Repeated Code Patterns (saves ~30 lines)

Several cleanup operations repeat similar patterns. Extract into helper functions.

---

## Expected Outcome

| Before | After |
|--------|-------|
| 2020 lines | ~1700 lines |
| Bundle timeout | Successful deploy |

This should bring the file under the bundler's timeout threshold while preserving all demo functionality:
- 20+ venues per city for leaderboard
- 25 demo users for social graph
- 10 demo plans with reactions
- Posts, yaps, reviews, check-ins

---

## Files to Modify

1. `supabase/functions/seed-demo-data/index.ts`
   - Trim `NYC_VENUES` to first 20 entries
   - Trim `LA_VENUES` to first 25 entries  
   - Trim `PB_VENUES` to first 15 entries
   - Reduce `DEMO_USERS` array to 25 entries
   - Consolidate cleanup helper logic

---

## Testing After Fix

1. Wait for automatic deploy (or manual trigger)
2. Go to Demo Settings → Seed LA Data
3. Verify toast shows success with stats
4. Check Feed → Plans tab for demo plans

