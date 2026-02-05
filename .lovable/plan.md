

## Remove Duplicate Like Count on Posts

### Problem
The post interaction area shows the like count twice:
1. In the action row: `❤️ 1 like 💬 0`
2. Below it again: `1 like`

### Solution
Remove the redundant paragraph that duplicates the like count below the interaction row.

---

### Change Details

**File:** `src/pages/Home.tsx`

**Remove lines 551-555:**
```tsx
{(post.likes_count || 0) > 0 && (
  <p className="text-white/80 text-sm">
    {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
  </p>
)}
```

**Reason:** The like count is already displayed at line 515 in the interaction bar as a clickable button: `{post.likes_count || 0} {post.likes_count === 1 ? 'like' : 'likes'}`

---

### Result
Posts will show the like count only once, in the interaction row alongside the heart icon.

