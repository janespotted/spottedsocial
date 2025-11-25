-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view thread members" ON public.dm_thread_members;

-- Create new policy that allows viewing all members of threads you're part of
CREATE POLICY "Users can view members of their threads"
ON public.dm_thread_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.dm_thread_members AS my_membership
    WHERE my_membership.thread_id = dm_thread_members.thread_id
    AND my_membership.user_id = auth.uid()
  )
);