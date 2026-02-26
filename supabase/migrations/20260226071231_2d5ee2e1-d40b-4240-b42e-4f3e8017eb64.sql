
-- Create read receipts table
CREATE TABLE public.dm_read_receipts (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.dm_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own read receipt"
  ON public.dm_read_receipts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Thread members can view read receipts"
  ON public.dm_read_receipts FOR SELECT
  USING (public.user_is_thread_member(thread_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_read_receipts;

-- Add messaging preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN show_typing_indicators boolean NOT NULL DEFAULT true,
  ADD COLUMN show_read_receipts boolean NOT NULL DEFAULT true;
