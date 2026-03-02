

## Fix: Notification banner should navigate to Activity Center

### Problem
Tapping a notification banner navigates to `/notifications` (a standalone page). It should go to the Messages page with the Activity tab selected.

### Change in `src/components/NotificationBanner.tsx`

**Line 35** — change the navigate target:
```typescript
// Before
navigate('/notifications');

// After
navigate('/messages?tab=activity');
```

This sends the user to the Messages page and selects the Activity tab, where the notification's corresponding activity entry lives.

### Files changed
- `src/components/NotificationBanner.tsx` (1 line)

