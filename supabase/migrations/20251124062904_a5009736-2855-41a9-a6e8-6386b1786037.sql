-- Fix RLS policy for dm_threads to allow thread creation
DROP POLICY IF EXISTS "Users can create threads" ON dm_threads;

CREATE POLICY "Users can create threads"
ON dm_threads
FOR INSERT
TO authenticated
WITH CHECK (true);