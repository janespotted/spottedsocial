-- Update venues with specific LA neighborhoods
UPDATE venues SET neighborhood = 'Hollywood' WHERE id = '1a3bc86a-8160-462b-bca6-cfc44740fae7'; -- Adults Only
UPDATE venues SET neighborhood = 'Fairfax District' WHERE id = '88e453fc-2762-4c8a-b8e8-9f01f53e58c7'; -- Genghis Cohen
UPDATE venues SET neighborhood = 'Historic Core' WHERE id = '7e47dca3-1308-4ee8-bd26-935941127c2e'; -- The Falls
UPDATE venues SET neighborhood = 'Hollywood' WHERE id = 'fef2ed93-2cd1-4597-bbfb-3be6aeca5500'; -- Davey Wayne's Basement

-- Delete closed venues
DELETE FROM venues WHERE id = 'a374c6cc-eae1-458a-a660-ce0a275fc83f'; -- Bootleg Theater (closed 2021)
DELETE FROM venues WHERE id = '43c5ada7-ee65-4a3e-bc00-5e84e1cfb801'; -- The Flats (non-existent)
DELETE FROM venues WHERE id = 'e2c14041-9a39-4319-adef-4e5abd5c7984'; -- The Rooftop at The Standard (closed ~2023)
DELETE FROM venues WHERE id = '03416f43-39ae-4b4b-b56f-236505072356'; -- The Satellite (closed 2020)
DELETE FROM venues WHERE id = '006c9d8c-008b-49ef-b225-fb79c2c0569e'; -- The Varnish (closed July 2024)