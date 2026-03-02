

## 5am Cleanup — Complete Ephemeral Data Wipe

### Current State
The `daily-cleanup` edge function currently handles: stale locations, stale check-ins, expired DMs, and expired night statuses. But it's **missing** cleanup for:
- **Posts** (have `expires_at` but never deleted server-side)
- **Yap messages** (have `expires_at` but never deleted server-side)
- **Planning statuses** (night_statuses where status='planning' should reset at 5am regardless of expires_at)
- **Plans** already have `expires_at` and are filtered client-side, but expired plans are never deleted from the database

Client-side queries already filter by `expires_at > now()` for posts, yaps, and plans — so users don't see stale data. But the data lingers in the database forever.

### Changes

**`supabase/functions/daily-cleanup/index.ts`** — add 4 new cleanup steps:

1. **Delete expired posts** — delete from `posts` where `expires_at < cutoff`
2. **Delete expired yap messages** — delete from `yap_messages` where `expires_at < cutoff`
3. **Reset all planning statuses** — update `night_statuses` where `status = 'planning'` and `updated_at < cutoff` → set status to `'home'`, clear fields
4. **Delete expired plans** — delete from `plans` where `expires_at < now()` (plans expire based on their event time, not the 5am cutoff)

Plans are special: they should persist until the event time passes (their `expires_at` is set to 5am the day after the plan_date), so we delete based on `expires_at < now()` rather than the 5am cutoff.

### Files changed
- `supabase/functions/daily-cleanup/index.ts` — add expired posts, yaps, planning statuses, and plans cleanup

