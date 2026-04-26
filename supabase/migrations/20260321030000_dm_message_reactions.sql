-- Add heart reactions to DM messages
CREATE TABLE IF NOT EXISTS public.dm_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction TEXT NOT NULL DEFAULT '❤️',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.dm_message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on messages in their threads
CREATE POLICY "Thread members can view reactions"
ON public.dm_message_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.dm_messages m
    JOIN public.dm_thread_members tm ON tm.thread_id = m.thread_id
    WHERE m.id = dm_message_reactions.message_id
    AND tm.user_id = auth.uid()
  )
);

-- Users can add reactions to messages in their threads
CREATE POLICY "Thread members can add reactions"
ON public.dm_message_reactions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.dm_messages m
    JOIN public.dm_thread_members tm ON tm.thread_id = m.thread_id
    WHERE m.id = dm_message_reactions.message_id
    AND tm.user_id = auth.uid()
  )
);

-- Users can delete their own reactions
CREATE POLICY "Users can delete own reactions"
ON public.dm_message_reactions
FOR DELETE
USING (auth.uid() = user_id);
