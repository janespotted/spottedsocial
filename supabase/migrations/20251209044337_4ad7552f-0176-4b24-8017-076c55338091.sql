-- Create function to cleanup old check-ins (older than 30 days)
-- This helps protect user privacy by not keeping indefinite location history
CREATE OR REPLACE FUNCTION public.cleanup_old_checkins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM checkins 
  WHERE ended_at IS NOT NULL 
    AND ended_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add index for efficient cleanup queries on ended_at column
CREATE INDEX IF NOT EXISTS idx_checkins_ended_at 
ON checkins(ended_at) 
WHERE ended_at IS NOT NULL;

-- Add constraint on dm_messages to limit text length (defense-in-depth)
ALTER TABLE dm_messages 
ADD CONSTRAINT dm_messages_text_length 
CHECK (char_length(text) <= 5000);

COMMENT ON FUNCTION public.cleanup_old_checkins() IS 'Deletes check-in records older than 30 days to protect user privacy. Call manually or via cron job.';