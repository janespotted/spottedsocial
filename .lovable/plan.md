

## Fix Back Button on Friends Page

### Problem
The back button on the `/friends` page uses `navigate(-1)` which fails when:
- User refreshes the page
- User navigates directly via URL
- No history exists in the session

### Solution
Replace `navigate(-1)` with a smarter navigation that falls back to `/profile` when there's no history.

---

### Implementation

#### File: `src/pages/Friends.tsx`

Change the back button handler from:
```tsx
onClick={() => navigate(-1)}
```

To use a helper that checks for history:
```tsx
const handleBack = () => {
  // If we have history, go back; otherwise go to profile
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/profile');
  }
};
```

Or simply always navigate to `/profile` for consistency (matching the pattern used in `CloseFriends.tsx` line 138):
```tsx
onClick={() => navigate('/profile')}
```

---

### Recommended Approach

Use a direct route (`/profile`) for the back button since:
1. Friends page is always accessed from Profile
2. More predictable behavior
3. Consistent with other similar pages (CloseFriends navigates to `/profile/edit`)

```tsx
// Line 467 - Change from:
<button
  onClick={() => navigate(-1)}
  className="p-2 -ml-2 text-white/80 hover:text-white"
>
  <ArrowLeft className="h-5 w-5" />
</button>

// To:
<button
  onClick={() => navigate('/profile')}
  className="p-2 -ml-2 text-white/80 hover:text-white"
>
  <ArrowLeft className="h-5 w-5" />
</button>
```

---

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Friends.tsx` | Update back button to `navigate('/profile')` |

