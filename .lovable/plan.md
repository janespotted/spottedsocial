

## Plan: Expire Notifications at 5am + Backfill with Friend Activity

### Problem
1. Notifications like "X wants to meet up" persist across nights — they should be wiped at 5am
2. When notifications list is empty, it feels dead — should show general friend activity like "Jon spotted at X venue"

### Changes

**1. `supabase/functions/daily-cleanup/index.ts`** — Add step 9: delete all notifications created before the 5am cutoff
```
// 9. Delete expired notifications
await supabase.from('notifications').delete().lt('created_at', cutoff)
```

**2. `src/contexts/NotificationsContext.tsx`** — Client-side filter: only fetch notifications from after the most recent 5am boundary (using `isFromTonight` from `time-context`), so stale ones disappear immediately without waiting for the cron

**3. `src/pages/Notifications.tsx`** — When the notifications list is empty, fetch recent friend check-ins and display them as "spotted at" activity items (e.g., "Jon spotted at The Rooftop Bar"). This uses the same check-in data the ActivityTab already fetches, styled as notification rows with the friend's avatar.

### Files changed
- `supabase/functions/daily-cleanup/index.ts` — add notification deletion step
- `src/contexts/NotificationsContext.tsx` — filter fetched notifications by 5am boundary
- `src/pages/Notifications.tsx` — add friend check-in backfill when no notifications exist

