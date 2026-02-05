

## Fix Friend Requests Button in Activity Tab

### Problem
The "Friend Requests" card in the Activity tab (Messages page) still navigates to the old `/friend-requests` route which was removed during the unification. This causes navigation to fail.

---

### Solution
Update the navigation to go to `/friends` instead, which now contains the unified friend management interface with the Requests tab.

---

### Implementation

#### File: `src/components/messages/ActivityTab.tsx`

Change line 607 from:
```tsx
onClick={() => navigate('/friend-requests')}
```

To:
```tsx
onClick={() => navigate('/friends', { state: { tab: 'requests' } })}
```

This navigates to the Friends page and opens directly on the Requests tab, matching the expected user flow.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/messages/ActivityTab.tsx` | Update navigation from `/friend-requests` to `/friends` with tab state |

