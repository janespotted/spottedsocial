-- Fix San Vicente Santa Monica coordinates (was placed near pier, should be at 1401 Ocean Ave)
UPDATE venues 
SET lat = 34.0167, lng = -118.5031
WHERE name = 'San Vicente Santa Monica' AND city = 'la';