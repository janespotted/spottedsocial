-- Fix: Demo status/checkin RLS policies were using a subquery on profiles table,
-- but profiles RLS was locked down to self-only reads, causing the subquery to fail.
-- night_statuses and checkins already have their own is_demo column, so use that directly.

DROP POLICY IF EXISTS "Demo statuses are visible to authenticated users" ON public.night_statuses;
CREATE POLICY "Demo statuses are visible to authenticated users"
  ON public.night_statuses FOR SELECT
  TO authenticated
  USING (is_demo = true);

DROP POLICY IF EXISTS "Demo checkins are visible to authenticated users" ON public.checkins;
CREATE POLICY "Demo checkins are visible to authenticated users"
  ON public.checkins FOR SELECT
  TO authenticated
  USING (is_demo = true);
