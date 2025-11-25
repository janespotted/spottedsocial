-- Add popularity_rank to venues table for ordered ranking
ALTER TABLE venues ADD COLUMN IF NOT EXISTS popularity_rank INTEGER DEFAULT 999;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_venues_popularity_rank ON venues(popularity_rank);