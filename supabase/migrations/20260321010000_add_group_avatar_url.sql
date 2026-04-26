-- Add group_avatar_url column to dm_threads for group chat pictures
ALTER TABLE public.dm_threads ADD COLUMN IF NOT EXISTS group_avatar_url TEXT;

-- Allow thread members to update thread name and group avatar
CREATE POLICY "Thread members can update threads"
ON public.dm_threads
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.dm_thread_members
    WHERE dm_thread_members.thread_id = dm_threads.id
    AND dm_thread_members.user_id = auth.uid()
  )
);
