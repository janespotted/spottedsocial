
## Fix Business Dashboard "peakHour" Error

### Root Cause

The error message **"Cannot read properties of null (reading 'peakHour')"** occurs in `BusinessDashboard.tsx` due to an unsafe null check.

**Problem Code (lines 191-192):**
```tsx
) : analytics?.peakHour !== null ? (
  formatHour(analytics.peakHour)  // ← Crashes when analytics is null
```

**Why it crashes:**
1. When `analytics` is `null`, `analytics?.peakHour` returns `undefined`
2. `undefined !== null` evaluates to `true`
3. Code enters the branch and calls `formatHour(analytics.peakHour)`
4. But `analytics` is still `null`, causing the "Cannot read properties of null" error

---

### Solution

Fix the conditional to properly check that `analytics` exists before accessing its properties.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/business/BusinessDashboard.tsx` | Fix null check on line 191-192 and similar patterns |

---

### Code Changes

**Before:**
```tsx
) : analytics?.peakHour !== null ? (
  formatHour(analytics.peakHour)
) : (
  'No data'
)}
```

**After:**
```tsx
) : analytics && analytics.peakHour !== null ? (
  formatHour(analytics.peakHour)
) : (
  'No data'
)}
```

---

### Additional Cleanup

While fixing this, I'll also update these related files that have broken references to the old `is_promoted` column:

| File | Issue | Fix |
|------|-------|-----|
| `src/lib/location-service.ts` | Uses `is_promoted: false` when creating venues | Change to `is_leaderboard_promoted: false, is_map_promoted: false` |
| `supabase/functions/seed-demo-data/index.ts` | Multiple references to `is_promoted` | Update to use new column names |

These weren't causing the immediate crash but would cause database errors when triggered.

---

### Testing

After the fix:
1. Navigate to `/business/dashboard`
2. Verify page loads without error
3. Check that analytics display correctly (or show "No data" gracefully)
