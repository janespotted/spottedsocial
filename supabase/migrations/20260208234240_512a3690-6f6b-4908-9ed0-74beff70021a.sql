-- Add star_rating column to venue_buzz_messages
ALTER TABLE venue_buzz_messages 
ADD COLUMN star_rating smallint CHECK (star_rating >= 1 AND star_rating <= 5);

-- Make text column nullable for rating-only submissions
ALTER TABLE venue_buzz_messages 
ALTER COLUMN text DROP NOT NULL;