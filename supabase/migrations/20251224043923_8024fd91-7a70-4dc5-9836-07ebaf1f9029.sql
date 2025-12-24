-- Fix: Revoke unnecessary anon access from create_dm_thread function
-- The function requires auth.uid() which will always be NULL for anon users
-- Only authenticated users should be able to call this function

REVOKE EXECUTE ON FUNCTION public.create_dm_thread(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_dm_thread(uuid) TO authenticated;

-- Also fix create_group_thread which has the same issue
REVOKE EXECUTE ON FUNCTION public.create_group_thread(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_group_thread(uuid[], text) TO authenticated;