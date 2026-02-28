

## Fix: Friend request acceptance fails silently due to RLS

### Root Cause
The `friendships` UPDATE RLS policy only allows `auth.uid() = user_id` to update rows. But when you **receive** a friend request, your ID is in the `friend_id` column, not `user_id`. So the update to `status = 'accepted'` is silently blocked by RLS — the toast says "accepted" but nothing changes in the database, and the request reappears on refresh.

### Changes

**Database migration** — Fix the UPDATE RLS policy to also allow the `friend_id` to update the friendship (specifically to accept/decline):
```sql
DROP POLICY "Users can update own friendships" ON public.friendships;
CREATE POLICY "Users can update own friendships" ON public.friendships
FOR UPDATE USING (
  (auth.uid() = user_id) OR (auth.uid() = friend_id)
);
```

**`src/pages/Friends.tsx`** — After accepting a request, invalidate the `friend-ids` and `profiles-safe` query caches so the My Friends tab, map, and profile count update immediately:
- Import `useQueryClient` from `@tanstack/react-query`
- After successful accept, call `queryClient.invalidateQueries({ queryKey: ['friend-ids'] })`

### Files changed
- `supabase/migrations/` — new migration (fix friendships UPDATE RLS)
- `src/pages/Friends.tsx` — invalidate caches after accept

