-- Reset cache for venues missing Google photo data
-- This forces the edge function to re-fetch from Google Places API
UPDATE venues 
SET hours_last_updated = NULL 
WHERE google_photo_refs IS NULL;