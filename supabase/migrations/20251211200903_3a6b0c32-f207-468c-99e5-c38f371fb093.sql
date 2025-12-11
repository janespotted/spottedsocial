-- Fix San Vicente Santa Monica coordinates (correct location at 1401 Ocean Ave)
UPDATE venues 
SET lat = 34.0166, lng = -118.4969
WHERE name = 'San Vicente Santa Monica' AND city = 'la';