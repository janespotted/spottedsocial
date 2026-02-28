

## Add admin auth gate to `refresh-leaderboard-energy` edge function

### Change (`supabase/functions/refresh-leaderboard-energy/index.ts`)

Insert auth verification after the CORS check (line 14), before the existing try block logic. Same pattern as the other three functions:

1. Read `SUPABASE_ANON_KEY` env var
2. Read `Authorization` header; return 401 if missing
3. Create auth client with anon key + auth header, call `getUser(token)`; return 401 on failure
4. Call `rpc('has_role', { _user_id: user.id, _role: 'admin' })`; return 403 if not admin
5. Log admin user ID, then proceed to existing service-role client and logic unchanged

~25 lines inserted between lines 15-16 (inside the try block, before the existing service-role client creation).

