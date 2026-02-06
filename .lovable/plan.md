

# Reduce Empty State Text on Home Page

## Current Copy
- **Title:** "It's early — you're ahead of the curve"
- **Description:** "When friends check in, you'll see them here. Why not be the first?"

## Proposed Copy (More Concise)
- **Title:** "It's early"
- **Description:** "Be the first to check in tonight"

---

## Technical Changes

### File: `src/pages/Home.tsx`

**Lines 407-412** - Shorten the title and description:

```typescript
// Before:
<h3 className="text-xl font-semibold text-white mb-2">
  It's early — you're ahead of the curve
</h3>
<p className="text-white/50 text-sm max-w-xs mb-6">
  When friends check in, you'll see them here. Why not be the first?
</p>

// After:
<h3 className="text-xl font-semibold text-white mb-2">
  It's early
</h3>
<p className="text-white/50 text-sm max-w-xs mb-6">
  Be the first to check in tonight
</p>
```

---

## Result

| Element | Before | After |
|---------|--------|-------|
| Title | 7 words | 2 words |
| Description | 13 words | 7 words |

The empty state will feel cleaner and more glanceable while keeping the encouraging tone.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Shorten empty state title and description |

