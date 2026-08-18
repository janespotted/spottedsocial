-- Fix: re-assert complete column-level SELECT grant on night_statuses.
--
-- The upsert (INSERT ... ON CONFLICT) requires SELECT on the table.
-- Column-level SELECT grants don't satisfy Postgres's table-level
-- SELECT check for ON CONFLICT, causing "permission denied" on every
-- upsert. Fix: restore table-level SELECT and INSERT/UPDATE grants,
-- then use RLS + the existing get_party_address() RPC to protect
-- party_address (which is already NULL in all SELECT RLS policies'
-- projections and only exposed via the SECURITY DEFINER RPC).

-- Restore full table-level grants
GRANT SELECT, INSERT, UPDATE ON public.night_statuses TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
