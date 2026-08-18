-- Grant SELECT on new planning_venue columns to authenticated role.
--
-- night_statuses uses column-level SELECT grants (party_address excluded).
-- The planning_venue_id and planning_venue_name columns added in
-- 20260818020000 were not included in the grant list, causing
-- "permission denied" on every upsert (PostgREST needs SELECT for RETURNING).

GRANT SELECT (planning_venue_id, planning_venue_name)
  ON public.night_statuses TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
