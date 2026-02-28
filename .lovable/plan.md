

## Update Edge Function JWT Settings in `supabase/config.toml`

Change `verify_jwt` from `false` to `true` for these four functions:

- `fix-venue-coordinates`
- `seed-demo-data`
- `send-daily-nudge`
- `refresh-leaderboard-energy` (needs to be added to config.toml — currently missing)

No changes to `send-push`, `get-venue-hours`, or `delete-account` (already `true`).

### Note on `send-daily-nudge`

This function already validates auth in code (checks Bearer token + admin role). Setting `verify_jwt = true` adds gateway-level rejection of unauthenticated requests before the function even runs.

### Note on `refresh-leaderboard-energy`

This function exists in `supabase/functions/` but has no entry in `config.toml`. It will be added with `verify_jwt = true`.

