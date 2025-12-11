-- Add planning_visibility column to night_statuses table
ALTER TABLE public.night_statuses 
ADD COLUMN IF NOT EXISTS planning_visibility text DEFAULT 'all_friends';

-- Add comment for documentation
COMMENT ON COLUMN public.night_statuses.planning_visibility IS 'Who can see planning status: close_friends, all_friends, mutual_friends';