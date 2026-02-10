

# Fix: Demo Plans Leaking Into Real Mode

## Problem

The "Share Plans" section in PlansFeed shows demo plans (Taylor at Le Bain, Jordan at House of Yes) even when demo mode is off. The `fetchPlans` function in `PlansFeed.tsx` has no `is_demo` filter.

## Change

### File: `src/components/PlansFeed.tsx` -- `fetchPlans` function (~line 404)

Add `.eq('is_demo', false)` to the plans query when demo mode is off:

```typescript
const { data: plansData, error: plansError } = await supabase
  .from('plans')
  .select('*')
  .eq('is_demo', false)                        // NEW: exclude demo plans
  .gte('expires_at', new Date().toISOString())
  .order('score', { ascending: false })
  .order('created_at', { ascending: false });
```

Since this component already imports `useDemoMode` and has `demoEnabled`, we can conditionally apply the filter only when demo mode is off, keeping demo plans visible during demo mode.

| File | Change |
|------|--------|
| `src/components/PlansFeed.tsx` | Add `is_demo = false` filter to `fetchPlans` query when demo mode is off |

Single line addition. Demo mode remains unaffected.
