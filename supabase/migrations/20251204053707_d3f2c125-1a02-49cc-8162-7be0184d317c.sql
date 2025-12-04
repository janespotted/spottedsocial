-- Add created_by column to dm_threads table
ALTER TABLE public.dm_threads 
ADD COLUMN created_by UUID REFERENCES public.profiles(id);

-- Drop and recreate the INSERT policy to require creator
DROP POLICY IF EXISTS "Users can create threads" ON public.dm_threads;

CREATE POLICY "Users can create threads" 
ON public.dm_threads 
FOR INSERT 
TO public
WITH CHECK (auth.uid() = created_by);