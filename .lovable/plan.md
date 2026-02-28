

## Add admin auth gate to `fix-venue-coordinates` edge function

### Change (`supabase/functions/fix-venue-coordinates/index.ts`)

Insert auth verification after the CORS check (line 14), before the existing logic. Matches the `send-daily-nudge` pattern:

1. Read `Authorization` header; return 401 if missing
2. Create an auth client with anon key + auth header, call `supabase.auth.getUser(token)` to verify; return 401 on failure
3. Call `supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })`; return 403 if not admin
4. Log admin user ID, then proceed to existing service-key logic unchanged

Insert between lines 14-15 (~20 lines of auth code). No changes to the rest of the function.

