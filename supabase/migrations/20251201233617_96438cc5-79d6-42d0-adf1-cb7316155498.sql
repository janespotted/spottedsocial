-- Add operating hours columns to venues table
ALTER TABLE venues 
ADD COLUMN google_place_id text DEFAULT NULL,
ADD COLUMN operating_hours jsonb DEFAULT NULL,
ADD COLUMN hours_last_updated timestamp with time zone DEFAULT NULL;