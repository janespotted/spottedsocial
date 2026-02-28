

## Fix: Empty Map in Demo Mode — Profiles RLS Blocking Demo Data

**Root cause**: The `profiles` table has a SELECT RLS policy that only allows `auth.uid() = id` (users can only read their own profile). When the map queries `night_statuses` with `profiles!inner(display_name, avatar_url, is_demo)`, PostgREST joins to `profiles` but RLS blocks reading other users' profiles. The `!inner` join then filters out all rows, returning an empty result.

This affects all queries that join `night_statuses` → `profiles` for demo users (map markers, planning friends, etc.).

### Fix

**Database migration**: Add a SELECT policy on `profiles` allowing authenticated users to read demo profiles:

```sql
CREATE POLICY "Demo profiles are readable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_demo = true);
```

This is safe because demo profiles contain no real PII — they're synthetic seed data. The existing policy (`auth.uid() = id`) continues to gate access to real user profiles.

No code changes needed — the existing queries will start working once the RLS policy is added.

