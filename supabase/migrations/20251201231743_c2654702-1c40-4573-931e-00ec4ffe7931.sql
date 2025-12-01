-- Add opened_at column to venues table
ALTER TABLE venues 
ADD COLUMN opened_at timestamp with time zone DEFAULT NULL;

-- Populate opened_at for newly opened LA venues
-- Adults Only opened October 2025
UPDATE venues 
SET opened_at = '2025-10-01T00:00:00Z'
WHERE name = 'Adults Only' AND city = 'la';

-- Spotlight LA opened September 2025
UPDATE venues 
SET opened_at = '2025-09-01T00:00:00Z'
WHERE name = 'Spotlight LA' AND city = 'la';