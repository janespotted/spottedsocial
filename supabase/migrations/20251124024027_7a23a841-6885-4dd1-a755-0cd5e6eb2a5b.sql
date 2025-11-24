-- Fix infinite recursion in dm_thread_members RLS policy
DROP POLICY IF EXISTS "Users can view thread members" ON dm_thread_members;

-- Create a simpler policy that doesn't cause recursion
CREATE POLICY "Users can view thread members"
ON dm_thread_members
FOR SELECT
USING (user_id = auth.uid());
