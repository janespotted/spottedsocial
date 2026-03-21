

## Plan: Fix Build Errors + Clean Up Dicebear Avatars

### 1. Fix Build Errors (code changes)

The `dm_threads` table has no `group_avatar_url` column. Two files reference it in their `.select()` queries, causing TypeScript errors.

**Fix**: Remove `group_avatar_url` from the select strings in both files. The code already falls back with `(threadInfo as any)?.group_avatar_url`, so removing it from select and keeping the fallback (or defaulting to `null`) is safe.

**Files to edit:**
- `src/components/messages/MessagesTab.tsx` line 108: change select from `'id, is_group, name, group_avatar_url'` to `'id, is_group, name'`
- `src/pages/Thread.tsx` line 203: change select from `'is_group, name, group_avatar_url'` to `'is_group, name'`

### 2. Clean Up Dicebear Avatar URLs (data operation)

Run via the insert tool:
```sql
UPDATE profiles SET avatar_url = NULL WHERE avatar_url LIKE '%dicebear%';
```

This nullifies any avatar URLs containing "dicebear" so real users get the default avatar treatment instead of broken placeholder images.

