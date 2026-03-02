

## Plan: Fix Invite Undo + Add Live Realtime Updates

### Problem 1: Undo Doesn't Work

**Root cause:** The DELETE RLS policy on the `notifications` table only allows `auth.uid() = receiver_id` — meaning only the **receiver** can delete a notification. But the undo code runs as the **sender**, so Supabase silently ignores the delete (no rows affected, no error thrown).

**Fix:** Add a new RLS policy allowing senders to delete their own sent notifications that are still unread.

**Database migration:**
```sql
CREATE POLICY "Senders can delete own unread notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = sender_id AND is_read = false);
```

This is safe because:
- Senders can only delete notifications they sent
- Only unread ones (once the recipient reads it, undo window is gone)
- The existing receiver delete policy stays unchanged

### Problem 2: Pages Not Updating Live

Currently only the Feed/Home pages and the Activity tab have realtime subscriptions. Other key pages (Map, Friends, Leaderboard, Profile) rely on manual refresh or `useVisibilityRefresh` (which only fires when the tab regains focus).

**Fix:** Add realtime subscriptions to the key pages that should stay live:

1. **`src/pages/Map.tsx`** — Subscribe to `checkins` and `night_statuses` changes to update friend pins live
2. **`src/pages/Friends.tsx`** — Subscribe to `friendships` and `night_statuses` changes so new friends and status changes appear instantly
3. **`src/pages/Leaderboard.tsx`** — Subscribe to `checkins` changes to update venue counts live

For each page, add a `useEffect` that creates a Supabase channel listening for `postgres_changes` on the relevant tables, and invalidates the appropriate React Query cache keys when changes occur. Use debounced refresh (1-2s) to prevent UI flickering during rapid updates.

**Pattern for each page:**
```typescript
useEffect(() => {
  if (!user) return;
  let timer: ReturnType<typeof setTimeout>;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['relevant-key'] });
    }, 1500);
  };
  const channel = supabase
    .channel('page-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_name' }, refresh)
    .subscribe();
  return () => { clearTimeout(timer); supabase.removeChannel(channel); };
}, [user]);
```

### Files Changed

| File | Change |
|------|--------|
| Database migration | Add sender DELETE policy on `notifications` |
| `src/pages/Map.tsx` | Add realtime subscription for `checkins` + `night_statuses` |
| `src/pages/Friends.tsx` | Add realtime subscription for `friendships` + `night_statuses` |
| `src/pages/Leaderboard.tsx` | Add realtime subscription for `checkins` |

