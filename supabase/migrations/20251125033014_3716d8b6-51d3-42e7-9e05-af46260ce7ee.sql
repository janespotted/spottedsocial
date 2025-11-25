-- Add tracking fields to checkins table
ALTER TABLE public.checkins
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill started_at with created_at for existing records
UPDATE public.checkins
SET started_at = created_at
WHERE started_at IS NULL;

-- Create index for faster active check-in queries
CREATE INDEX IF NOT EXISTS idx_checkins_user_active 
ON public.checkins(user_id, ended_at) 
WHERE ended_at IS NULL;

-- Create index for recent check-ins
CREATE INDEX IF NOT EXISTS idx_checkins_user_recent 
ON public.checkins(user_id, started_at DESC);

-- Add comment to explain the schema
COMMENT ON COLUMN public.checkins.started_at IS 'When the user initially checked in to this venue';
COMMENT ON COLUMN public.checkins.ended_at IS 'When the user left this venue or went home. NULL means still active';
COMMENT ON COLUMN public.checkins.last_updated_at IS 'Last time this check-in was refreshed/confirmed';