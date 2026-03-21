

## Apply Migration: Add `group_avatar_url` to `dm_threads`

The migration file `supabase/migrations/20260321010000_add_group_avatar_url.sql` exists but hasn't been applied yet. The column `group_avatar_url` does not currently exist on the `dm_threads` table.

### Step
Use the database migration tool to run:

```sql
ALTER TABLE public.dm_threads ADD COLUMN IF NOT EXISTS group_avatar_url TEXT;
```

This will add the `group_avatar_url` column, which the code in `MessagesTab.tsx` and `Thread.tsx` already references via `(threadInfo as any)?.group_avatar_url`. Once applied, we can also restore the proper `.select()` queries to include `group_avatar_url` directly instead of using the `as any` cast.

### Impact
- Group chats will be able to store a custom avatar URL
- No RLS changes needed — the existing SELECT/INSERT policies on `dm_threads` already cover this column
- No code changes required for this step (the fallback already handles it)

