
-- Block enforcement: update dm_messages INSERT policy to check blocked_users
DROP POLICY IF EXISTS "Users can send messages" ON public.dm_messages;

CREATE POLICY "Users can send messages"
ON public.dm_messages
FOR INSERT
WITH CHECK (
  (auth.uid() = sender_id)
  AND (EXISTS (
    SELECT 1 FROM dm_thread_members
    WHERE dm_thread_members.thread_id = dm_messages.thread_id
    AND dm_thread_members.user_id = auth.uid()
  ))
  AND NOT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (
      (blocker_id IN (
        SELECT dtm.user_id FROM dm_thread_members dtm
        WHERE dtm.thread_id = dm_messages.thread_id AND dtm.user_id != auth.uid()
      ) AND blocked_id = auth.uid())
      OR
      (blocker_id = auth.uid() AND blocked_id IN (
        SELECT dtm.user_id FROM dm_thread_members dtm
        WHERE dtm.thread_id = dm_messages.thread_id AND dtm.user_id != auth.uid()
      ))
    )
  )
);
