-- Create rate limit actions table
CREATE TABLE public.rate_limit_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rate_limit_actions ENABLE ROW LEVEL SECURITY;

-- Policy: users can only insert their own actions
CREATE POLICY "Users can insert own rate limit actions"
ON public.rate_limit_actions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: users can read their own actions (for rate limit checks)
CREATE POLICY "Users can read own rate limit actions"
ON public.rate_limit_actions
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_rate_limit_actions_user_type_time 
ON public.rate_limit_actions (user_id, action_type, created_at);

-- Function to check if user is rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action_type TEXT,
  p_max_count INTEGER,
  p_window_hours INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO action_count
  FROM rate_limit_actions
  WHERE user_id = p_user_id
    AND action_type = p_action_type
    AND created_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  
  RETURN action_count < p_max_count;
END;
$$;

-- Function to record an action and check rate limit in one call
CREATE OR REPLACE FUNCTION public.record_rate_limited_action(
  p_action_type TEXT,
  p_max_count INTEGER,
  p_window_hours INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  action_count INTEGER;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check current count
  SELECT COUNT(*) INTO action_count
  FROM rate_limit_actions
  WHERE user_id = current_user_id
    AND action_type = p_action_type
    AND created_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
  
  -- If already at limit, return false
  IF action_count >= p_max_count THEN
    RETURN false;
  END IF;
  
  -- Record the action
  INSERT INTO rate_limit_actions (user_id, action_type)
  VALUES (current_user_id, p_action_type);
  
  RETURN true;
END;
$$;

-- Cleanup function for old rate limit records (call periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_actions 
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;