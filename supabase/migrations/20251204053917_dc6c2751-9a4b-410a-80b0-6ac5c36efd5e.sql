-- Drop and recreate with explicit null check
DROP POLICY IF EXISTS "Users can create threads" ON public.dm_threads;

CREATE POLICY "Users can create threads" 
ON public.dm_threads 
FOR INSERT 
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);