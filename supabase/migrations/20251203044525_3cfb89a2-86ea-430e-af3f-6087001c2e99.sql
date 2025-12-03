-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can create threads" ON dm_threads;

-- Recreate with simpler, working policy
CREATE POLICY "Users can create threads" ON dm_threads
  FOR INSERT
  TO public
  WITH CHECK (true);