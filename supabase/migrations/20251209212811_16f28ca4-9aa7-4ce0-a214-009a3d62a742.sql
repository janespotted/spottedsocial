-- Create plan_downs table for "I'm Down" reactions
CREATE TABLE public.plan_downs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

-- Enable RLS
ALTER TABLE public.plan_downs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view plan downs" ON public.plan_downs
  FOR SELECT USING (true);

CREATE POLICY "Users can add their own downs" ON public.plan_downs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own downs" ON public.plan_downs
  FOR DELETE USING (auth.uid() = user_id);