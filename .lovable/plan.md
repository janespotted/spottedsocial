

## Fix: Demo friendships not being created in seed function

**Root cause**: The `friendships` bulk insert on line 141 of `seed-demo-data/index.ts` silently fails. With 9 real users × 24 demo users = 216 rows, if any row violates the unique constraint `(user_id, friend_id)` (e.g., from a previous partial seed), the entire batch insert fails with no error handling.

### Changes

**`supabase/functions/seed-demo-data/index.ts`** (line ~141):
1. Add `{ onConflict: 'user_id,friend_id' }` to the friendships insert to handle duplicates gracefully
2. Add error logging so failures aren't silently swallowed
3. Batch the insert into chunks (Supabase has limits on bulk inserts) — 216 rows at once may exceed payload limits

```typescript
// Replace line 141:
if(fr.length) {
  // Insert in batches of 50 to avoid payload limits
  for(let i=0; i<fr.length; i+=50) {
    const batch = fr.slice(i, i+50);
    const { error: fErr } = await sb.from('friendships').upsert(batch, { onConflict: 'user_id,friend_id' });
    if (fErr) console.error('Friendship insert error:', fErr.message);
  }
}
```

No other file changes needed — once friendships are properly created, the `useFriendIds` hook will return demo user IDs, and the Invite Friends modal will populate correctly.

