-- Add 'off' value to night_status_enum
ALTER TYPE night_status_enum ADD VALUE IF NOT EXISTS 'off';

-- Create daily_nudges tracking table
CREATE TABLE public.daily_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nudge_date date NOT NULL DEFAULT CURRENT_DATE,
  first_nudge_sent_at timestamptz,
  first_nudge_response text, -- 'going_out' | 'maybe' | 'staying_in' | null
  second_nudge_sent_at timestamptz,
  second_nudge_response text, -- 'still_going' | 'staying_in' | null
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, nudge_date)
);

-- Enable RLS
ALTER TABLE public.daily_nudges ENABLE ROW LEVEL SECURITY;

-- Users can view their own nudge records
CREATE POLICY "Users can view own nudges"
ON public.daily_nudges
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own nudge responses
CREATE POLICY "Users can insert own nudges"
ON public.daily_nudges
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own nudge responses
CREATE POLICY "Users can update own nudges"
ON public.daily_nudges
FOR UPDATE
USING (auth.uid() = user_id);

-- Add index for efficient querying
CREATE INDEX idx_daily_nudges_user_date ON public.daily_nudges(user_id, nudge_date);