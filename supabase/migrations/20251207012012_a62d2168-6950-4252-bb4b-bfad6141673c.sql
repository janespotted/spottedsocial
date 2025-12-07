-- Drop existing check constraint on venues type column
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_type_check;

-- Update NYC venue types
UPDATE venues SET type = 'cocktail_bar' WHERE name IN ('Double Chicken Please', 'The Dead Rabbit', 'Dante NYC', 'Attaboy', 'Sunken Harbor Club', 'schmuck.', 'Paul''s Cocktail Lounge', 'The Campbell', 'Ketchy Shuby', 'Amber Room', 'Saint Tuesday') AND city = 'nyc';

UPDATE venues SET type = 'bar' WHERE name IN ('Jean''s', 'Bar Snack', 'The Nines', 'Little Sister Lounge', 'Paul''s Casablanca', 'The Mulberry', 'Superbueno', 'Gospël', 'Sunn''s', 'Patent Pending', 'Studio Maison Nur', 'Unveiled') AND city = 'nyc';

UPDATE venues SET type = 'rooftop' WHERE name IN ('Le Bain', 'PHD Rooftop', '230 Fifth', 'Public Hotel Rooftop') AND city = 'nyc';

-- Update LA venue types
UPDATE venues SET type = 'cocktail_bar' WHERE name IN ('Seven Grand', 'The Edison', '1642', 'Dirty Laundry', 'The Roger Room', 'The Varnish', 'Clifton''s Republic', 'Good Times at Davey Wayne''s', 'No Vacancy', 'Break Room 86', 'The Townhouse & Del Monte Speakeasy') AND city = 'la';

UPDATE venues SET type = 'bar' WHERE name IN ('The Bungalow', 'Akbar', 'The Short Stop', 'The Dresden', 'Covell', 'The York', 'Highland Park Bowl', 'Tenants of the Trees', 'The Basement Tavern', 'The Falls', 'The Escondite', 'The Galley', 'Genghis Cohen', 'The Black Cat', 'The Roosterfish', 'Finn McCool''s', 'Simmzy''s Manhattan Beach', 'Adults Only', 'The Flats', 'Bootleg Theater', 'Davey Wayne''s Basement', 'The Satellite', 'The Rooftop at The Standard') AND city = 'la';

UPDATE venues SET type = 'rooftop' WHERE name IN ('High Rooftop Lounge', 'EP & LP', 'Skybar', 'The Argyle') AND city = 'la';

-- Add new check constraint with all allowed types
ALTER TABLE venues ADD CONSTRAINT venues_type_check CHECK (type IN ('nightclub', 'cocktail_bar', 'bar', 'rooftop'));