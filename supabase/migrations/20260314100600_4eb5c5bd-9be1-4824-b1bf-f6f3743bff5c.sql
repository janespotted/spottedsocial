CREATE TABLE public.push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  stage text,
  detail jsonb
);

ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all inserts" ON public.push_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can read" ON public.push_logs FOR SELECT TO authenticated USING (true);