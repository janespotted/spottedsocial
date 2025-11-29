-- Delete all duplicate venues with popularity_rank = 999 (these are duplicates)
DELETE FROM venues WHERE popularity_rank = 999;

-- Update lowkey venues to be promoted
UPDATE venues 
SET is_promoted = true 
WHERE name IN ('Unveiled', 'Studio Maison Nur', 'Little Sister Lounge', 'Patent Pending');

-- Ensure all other venues are NOT promoted
UPDATE venues 
SET is_promoted = false 
WHERE name NOT IN ('Unveiled', 'Studio Maison Nur', 'Little Sister Lounge', 'Patent Pending');

-- Add unique constraint on venue name to prevent future duplicates
ALTER TABLE venues ADD CONSTRAINT venues_name_unique UNIQUE (name);