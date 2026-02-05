

## Fix Post Header Text Alignment

### Problem
When venue names are long (like "The Townhouse & Del Monte Speakeasy"), the text wraps and appears misaligned or centered instead of being consistently left-aligned.

### Root Cause
The header layout uses flexbox with `items-center` which vertically centers children. When text wraps, this can cause visual misalignment. The text container needs explicit width constraints to prevent awkward wrapping.

### Solution
1. Add `min-w-0` to the text container to allow proper text truncation in flex layouts
2. Add `flex-1` to let it take available space without overflowing
3. Keep the `text-left` class for alignment

---

### Change Details

**File:** `src/pages/Home.tsx`

**Current (line 434):**
```tsx
<div className="text-left">
```

**Updated:**
```tsx
<div className="text-left min-w-0 flex-1">
```

This ensures:
- Text stays left-aligned
- Long venue names don't break the layout
- Proper text wrapping within the available space

---

### Technical Details

| Property | Purpose |
|----------|---------|
| `text-left` | Keeps text left-aligned |
| `min-w-0` | Allows flex child to shrink below content size (prevents overflow) |
| `flex-1` | Takes remaining space in the flex container |

