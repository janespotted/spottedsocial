-- Update LA venue neighborhoods with detailed neighborhood names
UPDATE venues 
SET neighborhood = 'Hollywood'
WHERE name IN ('Academy LA', 'Sound Nightclub', 'Avalon Hollywood', 'No Vacancy', 'Warwick', 'Good Times at Davey Wayne''s', 'Dirty Laundry', 'The Argyle', 'Davey Wayne''s Basement');

UPDATE venues 
SET neighborhood = 'Downtown LA'
WHERE name IN ('Exchange LA', 'The Mayan', 'Resident', 'The Rooftop at The Standard', 'The Varnish', 'Seven Grand', 'The Edison', 'Clifton''s Republic', 'The Escondite');

UPDATE venues 
SET neighborhood = 'West Hollywood'
WHERE name IN ('EP & LP', 'Nightingale Plaza', 'Skybar', 'The Roger Room');

UPDATE venues 
SET neighborhood = 'Mid-Wilshire'
WHERE name = 'Catch One';

UPDATE venues 
SET neighborhood = 'Koreatown'
WHERE name = 'Break Room 86';

UPDATE venues 
SET neighborhood = 'Santa Monica'
WHERE name = 'The Bungalow';

UPDATE venues 
SET neighborhood = 'Silver Lake'
WHERE name IN ('Spotlight LA', 'The Satellite');

UPDATE venues 
SET neighborhood = 'Culver City'
WHERE name = 'The Flats';

UPDATE venues 
SET neighborhood = 'Fairfax'
WHERE name = 'Genghis Cohen';

UPDATE venues 
SET neighborhood = 'Los Feliz'
WHERE name = 'The Falls';

UPDATE venues 
SET neighborhood = 'Westlake'
WHERE name = 'Bootleg Theater';

UPDATE venues 
SET neighborhood = 'Highland Park'
WHERE name = 'Adults Only';