
CREATE TABLE public.dm_typing_indicators (
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE public.dm_typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own typing" ON public.dm_typing_indicators
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Thread members can view typing" ON public.dm_typing_indicators
  FOR SELECT USING (public.user_is_thread_member(thread_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_typing_indicators;
