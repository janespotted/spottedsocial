-- Add city column to venues table for dual-city support
ALTER TABLE venues ADD COLUMN city text DEFAULT 'nyc';

-- Update all existing venues to be NYC
UPDATE venues SET city = 'nyc';

-- Add constraint to only allow 'nyc' or 'la'
ALTER TABLE venues ADD CONSTRAINT valid_city CHECK (city IN ('nyc', 'la'));