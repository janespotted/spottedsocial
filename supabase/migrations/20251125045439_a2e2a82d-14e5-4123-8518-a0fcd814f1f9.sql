-- Create a helper function that bypasses RLS to check thread membership
CREATE OR REPLACE FUNCTION public.user_is_thread_member(thread_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dm_thread_members
    WHERE thread_id = thread_uuid AND user_id = auth.uid()
  );
$$;

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view members of their threads" ON public.dm_thread_members;

-- Create new policy using the security definer function
CREATE POLICY "Users can view members of their threads"
ON public.dm_thread_members
FOR SELECT
USING (user_is_thread_member(thread_id));