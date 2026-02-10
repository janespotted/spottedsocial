

# Fix: Demo DMs Not Appearing in Messages Tab

## Root Cause

The demo was seeded **before** the DM creation code was added to the seed function. The `DemoActivator` only triggers once (when `?demo=yc` URL param is present), so it won't re-seed on subsequent visits. Result: DM threads were never created for the current user.

## Solution

Two changes to ensure DMs always appear in demo mode:

### 1. MessagesTab: Auto-seed DMs when missing in demo mode

**File: `src/components/messages/MessagesTab.tsx`**

After `fetchThreads` completes, if `demoEnabled === true` and `threads` is empty, automatically invoke the `seed-demo-data` edge function (with the current user's ID and city) and re-fetch threads. This ensures DMs are created even if the original seed ran before the DM code existed.

Add a guard (`hasTriedDemoSeed` ref) to prevent infinite loops -- only attempt once per session.

```typescript
const hasTriedDemoSeed = useRef(false);

// After fetchThreads sets threads to []
if (demoEnabled && threads.length === 0 && !hasTriedDemoSeed.current) {
  hasTriedDemoSeed.current = true;
  // Re-seed to create DMs
  await supabase.functions.invoke('seed-demo-data', {
    body: { action: 'seed', city: getDemoCity(), userId: user.id }
  });
  // Re-fetch threads
  fetchThreads();
}
```

### 2. Seed function: Skip cleanup if data already exists (optional optimization)

The seed function already handles re-seeding gracefully (it deletes old demo data first, then recreates). No changes needed to the edge function itself since it was already updated with DM creation logic.

## Summary

| File | Change |
|------|--------|
| `src/components/messages/MessagesTab.tsx` | Add auto-seed logic: when demo mode is on and inbox is empty, trigger seed-demo-data once and re-fetch threads |

## Expected Result

- User visits Messages tab in demo mode
- If no DM threads exist, the seed function runs automatically (one-time)
- 4 demo DM conversations appear with realistic nightlife chat messages
- Subsequent visits use the already-seeded data without re-triggering
