-- Create event_logs table for internal debugging
CREATE TABLE public.event_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own logs
CREATE POLICY "Users can insert own logs"
ON public.event_logs
FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Users can read their own logs
CREATE POLICY "Users can read own logs"
ON public.event_logs
FOR SELECT
TO public
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_event_logs_user_id ON public.event_logs(user_id);
CREATE INDEX idx_event_logs_event_type ON public.event_logs(event_type);
CREATE INDEX idx_event_logs_created_at ON public.event_logs(created_at DESC);