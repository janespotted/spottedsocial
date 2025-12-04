-- Fix RLS policies on dm_threads and dm_thread_members tables
-- Drop existing policies with empty role assignments
DROP POLICY IF EXISTS "Users can create threads" ON public.dm_threads;
DROP POLICY IF EXISTS "Users can view own threads" ON public.dm_threads;
DROP POLICY IF EXISTS "Users can add thread members" ON public.dm_thread_members;
DROP POLICY IF EXISTS "Users can view members of their threads" ON public.dm_thread_members;

-- Recreate dm_threads policies with proper TO public role
CREATE POLICY "Users can create threads" 
ON public.dm_threads 
FOR INSERT 
TO public
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view own threads" 
ON public.dm_threads 
FOR SELECT 
TO public
USING (EXISTS (
  SELECT 1 FROM dm_thread_members
  WHERE dm_thread_members.thread_id = dm_threads.id 
  AND dm_thread_members.user_id = auth.uid()
));

-- Recreate dm_thread_members policies with proper TO public role
CREATE POLICY "Users can add thread members" 
ON public.dm_thread_members 
FOR INSERT 
TO public
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view members of their threads" 
ON public.dm_thread_members 
FOR SELECT 
TO public
USING (user_is_thread_member(thread_id));