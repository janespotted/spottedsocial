

# Fix Newsfeed Post Layout for Text-Only Posts

## Problem
Currently the post layout is always: header → media (if any) → likes/comments row → caption text. For posts **without** media, the text appears below the action buttons, which looks broken. The reference screenshot confirms the desired layout.

## Desired Layout

**With media:** header → media → likes/comments/share → caption
**Without media:** header → caption → likes/comments/share

## Change

### `src/pages/Feed.tsx` — lines 291–346

The content section currently renders actions first, then text. We need to conditionally reorder:

```tsx
<div className="px-4 pb-4 space-y-3">
  {/* Text ABOVE actions when no media */}
  {!post.image_url && (
    <p className="text-white text-base leading-relaxed">{post.text}</p>
  )}

  {/* Likes / comments / share row (unchanged) */}
  <div className="flex items-center gap-5">
    {/* ... all existing action buttons unchanged ... */}
  </div>

  {/* Text BELOW actions when there IS media */}
  {post.image_url && (
    <p className="text-white text-base leading-relaxed">{post.text}</p>
  )}

  {/* Comments section (unchanged) */}
  {expandedPostId === post.id && ( ... )}
</div>
```

Only one file changes — `src/pages/Feed.tsx`. The single `<p>` tag on line 346 is replaced by two conditional renders of the same element, placed before and after the action buttons respectively.

