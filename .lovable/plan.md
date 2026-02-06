

# Update "Who's Out Tonight?" Section Header

## Overview
Simple copy update to the FriendsPlanning component header and add a subtitle.

---

## Changes

### File: `src/components/FriendsPlanning.tsx`

**Line 207-208** - Update header and add subtitle:

```tsx
// Before:
<span className="text-lg">👀</span>
<h3 className="text-white font-semibold text-sm">Who's Out Tonight?</h3>

// After:
<div>
  <div className="flex items-center gap-2">
    <span className="text-lg">👀</span>
    <h3 className="text-white font-semibold text-sm">Thinking About Tonight?</h3>
  </div>
  <p className="text-white/50 text-xs mt-0.5 ml-7">Friends who might go out tonight</p>
</div>
```

---

## Result

| Element | Before | After |
|---------|--------|-------|
| Header | "Who's Out Tonight?" | "Thinking About Tonight?" |
| Subtitle | (none) | "Friends who might go out tonight" |

This makes the section's purpose crystal clear - it's for friends who are in the "maybe" state, not yet committed to a plan.

