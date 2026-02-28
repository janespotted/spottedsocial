
-- Allow authenticated users to see demo user night statuses
-- This fixes: no avatars on map, "no friends out", and invite failures in demo mode
CREATE POLICY "Demo statuses are visible to authenticated users"
  ON public.night_statuses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = night_statuses.user_id AND p.is_demo = true
    )
  );

-- Also allow demo checkins to be visible
CREATE POLICY "Demo checkins are visible to authenticated users"
  ON public.checkins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = checkins.user_id AND p.is_demo = true
    )
  );
