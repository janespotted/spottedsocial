

# Polish Text-Only Newsfeed Posts

## Changes — `src/pages/Home.tsx`

Two small edits in the text-only caption block (lines 476–482):

1. **Larger text**: Change `text-base` → `text-[17px]` on the caption div (line 479) to make text-only posts feel like primary content rather than a caption label.

2. **Tighter spacing**: On the wrapping container (line 476), change `p-4 space-y-3` → `pt-2 px-4 pb-4 space-y-3` **only for text-only posts**. Since the container is shared with media posts, the cleaner approach is to reduce spacing on just the caption div itself: remove the `space-y-3` gap contribution by adding `-mt-1` or simply reducing the container's top padding conditionally. The simplest correct approach: keep the container as-is (`p-4 space-y-3`) but add a negative top margin on the text-only caption div: `className="-mt-1 text-white text-[17px] leading-relaxed font-medium"`.

   Actually, the better approach is to conditionally set the container's top padding. When there's no image, the `p-4` creates a gap between the header row and the caption. We can handle this by:
   - Changing the container className from `"p-4 space-y-3"` to a conditional: `{!post.image_url ? "pt-1 px-4 pb-4 space-y-3" : "p-4 space-y-3"}`
   - This reduces the gap between the username row and the caption text from 16px to 4px, making them feel connected.

3. **Slightly bolder weight**: Add `font-medium` to the caption to give it more presence as the card's main content.

### Summary of line changes

**Line 476** — conditional padding on the content container:
```tsx
// Before:
<div className="p-4 space-y-3">

// After:
<div className={!post.image_url ? "pt-1 px-4 pb-4 space-y-3" : "p-4 space-y-3"}>
```

**Line 479** — larger, bolder caption text:
```tsx
// Before:
<div className="text-white text-base leading-relaxed">

// After:
<div className="text-white text-[17px] leading-relaxed font-medium">
```

No other files affected. No backend changes.

