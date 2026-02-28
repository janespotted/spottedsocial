-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Users can add thread members" ON public.dm_thread_members;

-- Block all direct inserts; only SECURITY DEFINER functions (create_dm_thread, create_group_thread) can insert
CREATE POLICY "Only functions can add thread members"
  ON public.dm_thread_members
  FOR INSERT
  WITH CHECK (false);