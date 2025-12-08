-- Fix LA venues incorrectly classified as nightclub -> bar
UPDATE venues SET type = 'bar' WHERE name = 'The Galley' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'The Short Stop' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'Seven Grand' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'The Escondite' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'Highland Park Bowl' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'Akbar' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'The Black Cat' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'The Townhouse & Del Monte Speakeasy' AND city = 'la';
UPDATE venues SET type = 'bar' WHERE name = 'The Roosterfish' AND city = 'la';

-- Fix LA venues incorrectly classified as nightclub -> cocktail_bar
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'The Edison' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'Dirty Laundry' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'No Vacancy' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'Covell' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'The Dresden' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'Good Times at Davey Wayne''s' AND city = 'la';
UPDATE venues SET type = 'cocktail_bar' WHERE name = 'The Basement Tavern' AND city = 'la';

-- Remove duplicate venues (keep the shorter/cleaner name versions)
DELETE FROM venues WHERE name = 'The Galley SM' AND city = 'la';
DELETE FROM venues WHERE name = 'Seven Grand DTLA' AND city = 'la';
DELETE FROM venues WHERE name = 'Highland Park Bowl HP' AND city = 'la';
DELETE FROM venues WHERE name = 'The Short Stop EP' AND city = 'la';