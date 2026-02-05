

## Consolidate Friends Buttons on Profile

### Problem
Two separate friend-related buttons in close proximity:
1. Small `UserPlus` icon next to stats → goes to Requests tab
2. Large "Invite Friends" button → goes to Invite tab

This is confusing and takes up unnecessary space.

---

### Solution
Consolidate into a **single unified button** that goes to the Friends page with smart defaults.

---

### Proposed Layout

```text
Current:
+------------------+  +------------------+
|   50    |   2    | [+] ← small icon
| Friends | Places |
+------------------+------------------+
| [👥 Invite Friends]  [QR] [Edit] |
+-------------------------------------+

After:
+------------------+  +------------------+
|   50    |   2    |
| Friends | Places |
+------------------+------------------+
| [👥 Friends]         [QR]   [Edit] |
+-------------------------------------+
```

---

### Implementation

#### File: `src/pages/Profile.tsx`

**Remove**: The small UserPlus icon button (lines 467-473)

**Update**: The "Invite Friends" button to become a general "Friends" button:
```tsx
<Button
  onClick={() => navigate('/friends')}
  className="flex-1 bg-[#a855f7] hover:bg-[#a855f7]/90 text-white rounded-full"
>
  <Users className="h-4 w-4 mr-2" />
  Friends
</Button>
```

This single button takes users to `/friends` where they can access all tabs:
- Requests (with pending count badge)
- Find (search existing users)
- Invite (share link/QR)

---

### Benefits

| Before | After |
|--------|-------|
| 2 friend buttons | 1 unified button |
| Confusing entry points | Single clear entry point |
| Redundant UI | Cleaner profile layout |
| Different icons (UserPlus x2) | Single Users icon |

---

### Alternative Consideration

If you want to keep requests prominent, we could add a notification badge to the single button when there are pending requests:

```tsx
<Button onClick={() => navigate('/friends')} className="...">
  <Users className="h-4 w-4 mr-2" />
  Friends
  {pendingRequestsCount > 0 && (
    <span className="ml-2 bg-red-500 text-white text-xs px-1.5 rounded-full">
      {pendingRequestsCount}
    </span>
  )}
</Button>
```

This way users still see pending requests at a glance.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Profile.tsx` | Remove small UserPlus button, update main button to "Friends" |

