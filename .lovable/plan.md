

## Add admin auth gate to `seed-demo-data` edge function

### Change (`supabase/functions/seed-demo-data/index.ts`)

Insert auth verification after the CORS check (line 48), before the try block. Same pattern as `fix-venue-coordinates` and `send-daily-nudge`:

1. Read `Authorization` header; return 401 if missing
2. Create auth client with anon key + auth header, call `getUser(token)`; return 401 on failure
3. Call `rpc('has_role', { _user_id: user.id, _role: 'admin' })`; return 403 if not admin
4. Log admin user ID, then proceed to existing try block with service-key client

Insert ~30 lines between lines 48-50. The existing service-key client and all seed/clear logic remains unchanged.

