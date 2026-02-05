-- Add new map promotion column
ALTER TABLE venues ADD COLUMN is_map_promoted boolean DEFAULT false;

-- Rename existing column for clarity
ALTER TABLE venues RENAME COLUMN is_promoted TO is_leaderboard_promoted;

-- Create index for efficient filtering on map promoted venues
CREATE INDEX idx_venues_map_promoted ON venues(is_map_promoted) WHERE is_map_promoted = true;

-- Create index for leaderboard promoted venues (rename existing implicit index behavior)
CREATE INDEX idx_venues_leaderboard_promoted ON venues(is_leaderboard_promoted) WHERE is_leaderboard_promoted = true;