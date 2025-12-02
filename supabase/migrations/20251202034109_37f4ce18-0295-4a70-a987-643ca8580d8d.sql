-- Add Google Places data columns to venues table for caching
ALTER TABLE venues 
  ADD COLUMN IF NOT EXISTS google_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS google_user_ratings_total INTEGER,
  ADD COLUMN IF NOT EXISTS google_photo_refs JSONB;