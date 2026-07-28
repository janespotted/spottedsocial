-- Fix: restore column-level SELECT on night_statuses for authenticated role,
-- excluding party_address (P0-6 protection).
--
-- WP6 (20260726030000) correctly revoked table-level SELECT and granted
-- column-level SELECT excluding party_address. But PostgREST's upsert
-- (RETURNING *) fails without table-level SELECT, producing
-- "permission denied for table night_statuses" on every check-in.
--
-- Fix: re-assert the column-level SELECT (idempotent), keep table-level
-- INSERT + UPDATE so upserts that write party_address keep working, and
-- reload PostgREST's schema cache so it picks up the column list.

-- 1. Ensure no table-level SELECT (idempotent)
REVOKE SELECT ON public.night_statuses FROM authenticated;

-- 2. Column-level SELECT on every column EXCEPT party_address
GRANT SELECT (
  id,
  user_id,
  status,
  lat,
  lng,
  venue_name,
  updated_at,
  expires_at,
  is_demo,
  is_promoted,
  venue_id,
  planning_neighborhood,
  planning_visibility,
  is_private_party,
  party_neighborhood
) ON public.night_statuses TO authenticated;

-- 3. Table-level INSERT + UPDATE (all columns, so upserts writing party_address work)
GRANT INSERT, UPDATE ON public.night_statuses TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
