-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can create threads" ON dm_threads;

-- Create a new policy that works with PostgREST routing
CREATE POLICY "Users can create threads" ON dm_threads
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() IS NOT NULL);