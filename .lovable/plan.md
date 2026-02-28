

## Fix `dm_thread_members` INSERT policy

### Migration

Drop the existing permissive INSERT policy and replace it with a `WITH CHECK (false)` policy that blocks all direct inserts. Thread member creation is handled exclusively by the `create_dm_thread` and `create_group_thread` SECURITY DEFINER functions, which bypass RLS.

```sql
-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Users can add thread members" ON public.dm_thread_members;

-- Block all direct inserts; only SECURITY DEFINER functions (create_dm_thread, create_group_thread) can insert
CREATE POLICY "Only functions can add thread members"
  ON public.dm_thread_members
  FOR INSERT
  WITH CHECK (false);
```

Single migration, no code changes needed — the app already uses the RPC functions for thread creation.

