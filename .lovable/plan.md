

# Fix: Duplicate Demo Profiles ("Alex" x36)

## Root Cause

The `seed-demo-data` edge function's `seed` action (line 32-121) cleans up old demo data before re-seeding, but it **does not clean up the `friendships` table** before deleting demo profiles. Since friendships reference demo user IDs, the profile deletes silently fail on foreign key constraints, while new profiles are created on top — resulting in 36 "Alex" profiles after multiple seed runs.

The `clear` action (line 122) correctly cleans friendships first, but the `seed` action skips this step.

## Fix (1 file)

### `supabase/functions/seed-demo-data/index.ts`

Add friendship cleanup to the `seed` action's cleanup block (before line 42 where profiles are deleted):

```typescript
// Before deleting profiles, clean up friendships referencing demo users
const { data: demoProfiles } = await sb.from('profiles').select('id').eq('is_demo', true);
if (demoProfiles?.length) {
  const demoIds = demoProfiles.map((x: any) => x.id);
  // Clean up DM threads with demo users
  const { data: dThreadMembers } = await sb.from('dm_thread_members').select('thread_id').in('user_id', demoIds);
  if (dThreadMembers?.length) {
    const tids = [...new Set(dThreadMembers.map((t: any) => t.thread_id))];
    await sb.from('dm_messages').delete().in('thread_id', tids);
    await sb.from('dm_thread_members').delete().in('thread_id', tids);
    await sb.from('dm_threads').delete().in('id', tids);
  }
  await sb.from('friendships').delete().in('user_id', demoIds);
  await sb.from('friendships').delete().in('friend_id', demoIds);
  // Also clean up related tables that reference demo user IDs
  await sb.from('checkins').delete().eq('is_demo', true);
  await sb.from('stories').delete().eq('is_demo', true);
}
```

This mirrors the same cleanup logic already in the `clear` action (lines 129-142), ensuring friendships and DM threads are removed before demo profiles are deleted.

## Immediate Data Fix

After deploying, re-run the seed with `clear` then `seed` to remove the 36 duplicate Alex profiles and start fresh with 12 clean demo users (including 1-2 "Alex" entries as designed).

## Files Modified
- `supabase/functions/seed-demo-data/index.ts` — add friendship/DM cleanup to `seed` action before profile deletion

