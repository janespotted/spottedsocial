

# Update "Who's Going Out Tonight?" Section Copy

## Overview
Simplify the section header, empty state, and CTA button with punchier, more casual copy.

---

## Changes

### File: `src/components/FriendsPlanning.tsx`

**1. Header (Lines 207-212)** - Simplify to single line header, remove subtitle:

```tsx
// Before:
<div>
  <div className="flex items-center gap-2">
    <span className="text-lg">👀</span>
    <h3 className="text-white font-semibold text-sm">Thinking About Tonight?</h3>
  </div>
  <p className="text-white/50 text-xs mt-0.5 ml-7">Friends who might go out tonight</p>
</div>

// After:
<div className="flex items-center gap-2">
  <span className="text-lg">👀</span>
  <h3 className="text-white font-semibold text-sm">Who's Going Out Tonight</h3>
</div>
```

**2. Empty State (Lines 238-242)** - Shorter, punchier copy:

```tsx
// Before:
<p className="text-white/40 text-xs text-center py-2">
  No friends thinking about tonight yet. Be the first?
</p>

// After:
<p className="text-white/40 text-xs text-center py-2">
  No one yet. Be first.
</p>
```

**3. CTA Button (Lines 406-412)** - Change to "I'm in":

```tsx
// Before:
<button ...>
  <Plus className="w-4 h-4" />
  I'm thinking too
</button>

// After:
<button ...>
  <Plus className="w-4 h-4" />
  I'm in
</button>
```

---

## Summary of Copy Changes

| Element | Before | After |
|---------|--------|-------|
| Header | "Thinking About Tonight?" | "Who's Going Out Tonight" |
| Subtitle | "Friends who might go out tonight" | (removed) |
| Empty state | "No friends thinking about tonight yet. Be the first?" | "No one yet. Be first." |
| CTA button | "I'm thinking too" | "I'm in" |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/components/FriendsPlanning.tsx` | Header simplified, subtitle removed, empty state shortened, CTA updated |

