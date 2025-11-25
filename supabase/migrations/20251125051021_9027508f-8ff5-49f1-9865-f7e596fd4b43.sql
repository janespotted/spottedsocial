-- Add 'nightclub' as a valid venue type
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_type_check;

ALTER TABLE venues ADD CONSTRAINT venues_type_check 
CHECK (type IN ('bar', 'club', 'lounge', 'nightclub'));