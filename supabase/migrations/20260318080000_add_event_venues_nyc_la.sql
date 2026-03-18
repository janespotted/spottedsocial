-- Add major event venues for NYC and LA
-- These are concert halls, music venues, event spaces, and large-format nightlife venues
-- Using type 'other' for event venues per the venues_type_check constraint

-- ============================================================================
-- NYC Event Venues
-- ============================================================================
INSERT INTO public.venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank) VALUES
-- Major Concert / Music Venues
('Brooklyn Steel', 40.7114, -73.9520, 'East Williamsburg', 'other', 'nyc', false, false, 0),
('Webster Hall', 40.7318, -73.9897, 'East Village', 'other', 'nyc', false, false, 0),
('Terminal 5', 40.7693, -73.9924, 'Hell''s Kitchen', 'other', 'nyc', false, false, 0),
('Irving Plaza', 40.7353, -73.9887, 'Gramercy', 'other', 'nyc', false, false, 0),
('Bowery Ballroom', 40.7204, -73.9936, 'Lower East Side', 'other', 'nyc', false, false, 0),
('Music Hall of Williamsburg', 40.7121, -73.9614, 'Williamsburg', 'other', 'nyc', false, false, 0),
('Rough Trade NYC', 40.7215, -73.9574, 'Williamsburg', 'other', 'nyc', false, false, 0),
('Mercury Lounge', 40.7222, -73.9867, 'Lower East Side', 'other', 'nyc', false, false, 0),
('Warsaw', 40.7252, -73.9517, 'Greenpoint', 'other', 'nyc', false, false, 0),
('Brooklyn Mirage', 40.7115, -73.9223, 'East Williamsburg', 'other', 'nyc', false, false, 0),
('Avant Gardner', 40.7113, -73.9219, 'East Williamsburg', 'other', 'nyc', false, false, 0),
('Kings Theatre', 40.6434, -73.9578, 'Flatbush', 'other', 'nyc', false, false, 0),
('Forest Hills Stadium', 40.7202, -73.8443, 'Forest Hills', 'other', 'nyc', false, false, 0),
('Hammerstein Ballroom', 40.7522, -73.9937, 'Midtown', 'other', 'nyc', false, false, 0),
('Radio City Music Hall', 40.7600, -73.9800, 'Midtown', 'other', 'nyc', false, false, 0),
('Beacon Theatre', 40.7807, -73.9812, 'Upper West Side', 'other', 'nyc', false, false, 0),
('The Rooftop at Pier 17', 40.7063, -74.0017, 'Seaport', 'other', 'nyc', false, false, 0),
('SummerStage Central Park', 40.7695, -73.9714, 'Central Park', 'other', 'nyc', false, false, 0),
('Racket NYC', 40.7268, -73.9893, 'East Village', 'other', 'nyc', false, false, 0),
('Baby''s All Right', 40.7102, -73.9613, 'Williamsburg', 'other', 'nyc', false, false, 0),
('Sultan Room', 40.7058, -73.9236, 'Bushwick', 'other', 'nyc', false, false, 0),
('National Sawdust', 40.7111, -73.9644, 'Williamsburg', 'other', 'nyc', false, false, 0),
('Le Poisson Rouge', 40.7283, -74.0003, 'Greenwich Village', 'other', 'nyc', false, false, 0),
('Knockdown Center', 40.7111, -73.9103, 'Ridgewood', 'other', 'nyc', false, false, 0),

-- Grand Event Spaces / Gala Venues
('Cipriani 42nd Street', 40.7527, -73.9789, 'Midtown', 'other', 'nyc', false, false, 0),
('Cipriani Wall Street', 40.7063, -74.0095, 'Financial District', 'other', 'nyc', false, false, 0),
('Cipriani South Street', 40.7047, -74.0027, 'Seaport', 'other', 'nyc', false, false, 0),
('Gotham Hall', 40.7490, -73.9862, 'Midtown', 'other', 'nyc', false, false, 0),
('The Plaza Hotel', 40.7645, -73.9744, 'Midtown', 'other', 'nyc', false, false, 0),
('Ziegfeld Ballroom', 40.7624, -73.9795, 'Midtown', 'other', 'nyc', false, false, 0),
('The Glasshouse', 40.7604, -73.9990, 'Hudson Yards', 'other', 'nyc', false, false, 0),
('Current at Chelsea Piers', 40.7465, -74.0080, 'Chelsea', 'other', 'nyc', false, false, 0),
('Chelsea Industrial', 40.7433, -74.0069, 'Chelsea', 'other', 'nyc', false, false, 0),
('Pioneer Works', 40.6809, -74.0123, 'Red Hook', 'other', 'nyc', false, false, 0),
('99 Scott', 40.7049, -73.9333, 'East Williamsburg', 'other', 'nyc', false, false, 0),
('The Williamsburg Hotel', 40.7167, -73.9636, 'Williamsburg', 'other', 'nyc', false, false, 0),
('Brooklyn Navy Yard', 40.7024, -73.9712, 'Navy Yard', 'other', 'nyc', false, false, 0),
('The Shed', 40.7538, -74.0015, 'Hudson Yards', 'other', 'nyc', false, false, 0),

-- Arenas / Large Venues
('Madison Square Garden', 40.7505, -73.9934, 'Midtown', 'other', 'nyc', false, false, 0),
('Barclays Center', 40.6826, -73.9754, 'Prospect Heights', 'other', 'nyc', false, false, 0),
('UBS Arena', 40.6571, -73.8415, 'Elmont', 'other', 'nyc', false, false, 0)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- LA Event Venues
-- ============================================================================
INSERT INTO public.venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank) VALUES
-- Major Concert / Music Venues
('The Wiltern', 34.0618, -118.3087, 'Koreatown', 'other', 'la', false, false, 0),
('Hollywood Palladium', 34.0983, -118.3251, 'Hollywood', 'other', 'la', false, false, 0),
('The Novo', 34.0430, -118.2675, 'Downtown LA', 'other', 'la', false, false, 0),
('Shrine Auditorium', 34.0258, -118.2810, 'University Park', 'other', 'la', false, false, 0),
('The Fonda Theatre', 34.1038, -118.3259, 'Hollywood', 'other', 'la', false, false, 0),
('El Rey Theatre', 34.0621, -118.3623, 'Mid-Wilshire', 'other', 'la', false, false, 0),
('The Roxy Theatre', 34.0903, -118.3854, 'West Hollywood', 'other', 'la', false, false, 0),
('The Troubadour', 34.0818, -118.3893, 'West Hollywood', 'other', 'la', false, false, 0),
('Whisky a Go Go', 34.0907, -118.3856, 'West Hollywood', 'other', 'la', false, false, 0),
('The Regent Theater', 34.0412, -118.2491, 'Downtown LA', 'other', 'la', false, false, 0),
('The Belasco', 34.0493, -118.2588, 'Downtown LA', 'other', 'la', false, false, 0),
('The Mayan', 34.0420, -118.2608, 'Downtown LA', 'other', 'la', false, false, 0),
('Echoplex', 34.0779, -118.2608, 'Echo Park', 'other', 'la', false, false, 0),
('The Echo', 34.0779, -118.2604, 'Echo Park', 'other', 'la', false, false, 0),
('Lodge Room', 34.1099, -118.2078, 'Highland Park', 'other', 'la', false, false, 0),
('Teragram Ballroom', 34.0492, -118.2582, 'Downtown LA', 'other', 'la', false, false, 0),
('Moroccan Lounge', 34.0437, -118.2461, 'Downtown LA', 'other', 'la', false, false, 0),
('Zebulon', 34.0642, -118.2291, 'Frogtown', 'other', 'la', false, false, 0),
('The Peppermint Club', 34.0899, -118.3849, 'West Hollywood', 'other', 'la', false, false, 0),
('Catch One', 34.0462, -118.3307, 'Mid-Wilshire', 'other', 'la', false, false, 0),

-- Grand Event Spaces
('The Ebell of Los Angeles', 34.0606, -118.3345, 'Mid-Wilshire', 'other', 'la', false, false, 0),
('Vibiana', 34.0467, -118.2474, 'Downtown LA', 'other', 'la', false, false, 0),
('Carondelet House', 34.0502, -118.2571, 'Downtown LA', 'other', 'la', false, false, 0),
('The Paramour Estate', 34.1093, -118.3615, 'Silver Lake', 'other', 'la', false, false, 0),
('The Wallis Annenberg Center', 34.0740, -118.3983, 'Beverly Hills', 'other', 'la', false, false, 0),
('The Skirball Cultural Center', 34.0729, -118.4722, 'Brentwood', 'other', 'la', false, false, 0),
('The Wende Museum', 34.1368, -118.2564, 'Eagle Rock', 'other', 'la', false, false, 0),
('The Majestic Downtown', 34.0461, -118.2547, 'Downtown LA', 'other', 'la', false, false, 0),

-- Arenas / Large Venues
('Hollywood Bowl', 34.1122, -118.3391, 'Hollywood', 'other', 'la', false, false, 0),
('The Greek Theatre', 34.1186, -118.2966, 'Los Feliz', 'other', 'la', false, false, 0),
('Crypto.com Arena', 34.0430, -118.2673, 'Downtown LA', 'other', 'la', false, false, 0),
('Kia Forum', 33.9583, -118.3420, 'Inglewood', 'other', 'la', false, false, 0),
('SoFi Stadium', 33.9535, -118.3392, 'Inglewood', 'other', 'la', false, false, 0),
('BMO Stadium', 34.0126, -118.1845, 'Exposition Park', 'other', 'la', false, false, 0),
('Rose Bowl', 34.1613, -118.1676, 'Pasadena', 'other', 'la', false, false, 0),
('Santa Monica Pier', 34.0094, -118.4973, 'Santa Monica', 'other', 'la', false, false, 0)
ON CONFLICT (name) DO NOTHING;
