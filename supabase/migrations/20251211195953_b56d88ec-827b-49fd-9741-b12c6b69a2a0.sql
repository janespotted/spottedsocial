-- Drop existing constraint and create more inclusive one
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_type_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_type_check CHECK (type IN ('bar', 'club', 'lounge', 'rooftop', 'speakeasy', 'members_club', 'restaurant', 'other', 'cocktail_bar', 'nightclub'));

-- NYC Elite Tier Members Clubs (22 venues)
INSERT INTO public.venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank) VALUES
('San Vicente West Village', 40.7378, -74.0084, 'West Village', 'members_club', 'nyc', false, false, 100),
('Zero Bond', 40.7259, -73.9946, 'NoHo', 'members_club', 'nyc', false, false, 101),
('ZZ''s Club', 40.7532, -74.0010, 'Hudson Yards', 'members_club', 'nyc', false, false, 102),
('Core Club', 40.7618, -73.9744, 'Midtown', 'members_club', 'nyc', false, false, 103),
('Casa Cipriani', 40.7012, -74.0030, 'Financial District', 'members_club', 'nyc', false, false, 104),
('Chez Margaux', 40.7403, -74.0060, 'Meatpacking', 'members_club', 'nyc', false, false, 105),
('Maxwell Tribeca', 40.7201, -74.0091, 'Tribeca', 'members_club', 'nyc', false, false, 106),
('The Twenty Two NYC', 40.7371, -73.9911, 'Flatiron', 'members_club', 'nyc', false, false, 107),
('Flyfish Club', 40.7224, -73.9923, 'Lower East Side', 'members_club', 'nyc', false, false, 108),
('Silencio NYC', 40.7238, -73.9997, 'SoHo', 'members_club', 'nyc', false, false, 109),
('The Ned NoMad', 40.7453, -73.9878, 'NoMad', 'members_club', 'nyc', false, false, 110),
('Bond House', 40.7181, -74.0065, 'Tribeca', 'members_club', 'nyc', false, false, 111),
('The Se7en', 40.6768, -73.9689, 'Prospect Heights', 'members_club', 'nyc', false, false, 112),
('Dumbo House', 40.7033, -73.9866, 'Dumbo', 'members_club', 'nyc', false, false, 113),
('Soho House Meatpacking', 40.7409, -74.0052, 'Meatpacking', 'members_club', 'nyc', false, false, 114),
('Soho House Lower East Side', 40.7189, -73.9883, 'Lower East Side', 'members_club', 'nyc', false, false, 115),
('Casa Tua NYC', 40.7749, -73.9611, 'Upper East Side', 'members_club', 'nyc', false, false, 116),
('The Waverly Inn', 40.7345, -74.0032, 'West Village', 'members_club', 'nyc', false, false, 117),
('The Mulberry House', 40.7232, -73.9959, 'Nolita', 'members_club', 'nyc', false, false, 118),
('Temple Bar', 40.7249, -73.9962, 'NoHo', 'members_club', 'nyc', false, false, 119),
('The Blond', 40.7251, -73.9988, 'SoHo', 'members_club', 'nyc', false, false, 120),
('The Nines Club', 40.7268, -73.9945, 'NoHo', 'members_club', 'nyc', false, false, 121)
ON CONFLICT (name) DO NOTHING;

-- LA Elite Members Clubs (22 venues)
INSERT INTO public.venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank) VALUES
('San Vicente Bungalows', 34.0896, -118.3811, 'West Hollywood', 'members_club', 'la', false, false, 100),
('San Vicente Santa Monica', 34.0090, -118.4975, 'Santa Monica', 'members_club', 'la', false, false, 101),
('Soho House West Hollywood', 34.0908, -118.3872, 'West Hollywood', 'members_club', 'la', false, false, 102),
('Soho Warehouse', 34.0273, -118.2341, 'Downtown LA', 'members_club', 'la', false, false, 103),
('The Britely', 34.0920, -118.3866, 'West Hollywood', 'members_club', 'la', false, false, 104),
('The Aster', 34.1008, -118.3271, 'Hollywood', 'members_club', 'la', false, false, 105),
('Living Room', 34.1010, -118.3273, 'Hollywood', 'members_club', 'la', false, false, 106),
('Members Restaurant & Club', 34.0946, -118.3608, 'West Hollywood', 'members_club', 'la', false, false, 107),
('The Nice Guy', 34.0808, -118.3796, 'West Hollywood', 'members_club', 'la', false, false, 108),
('Sanctuary Club', 34.0785, -118.3688, 'Beverly Grove', 'members_club', 'la', false, false, 109),
('The Fleur Room LA', 34.0899, -118.3850, 'West Hollywood', 'members_club', 'la', false, false, 110),
('Gravitas Beverly Hills', 34.0693, -118.4015, 'Beverly Hills', 'members_club', 'la', false, false, 111),
('Spring Place Beverly Hills', 34.0656, -118.4018, 'Beverly Hills', 'members_club', 'la', false, false, 112),
('HuG House', 34.0839, -118.3659, 'Melrose', 'members_club', 'la', false, false, 113),
('Little Beach House Malibu', 34.0335, -118.6815, 'Malibu', 'members_club', 'la', false, false, 114),
('NeueHouse Hollywood', 34.0967, -118.3217, 'Hollywood', 'members_club', 'la', false, false, 115),
('NeueHouse Venice Beach', 33.9907, -118.4687, 'Venice', 'members_club', 'la', false, false, 116),
('The Gathering Spot LA', 34.0325, -118.3510, 'West Adams', 'members_club', 'la', false, false, 117),
('Chateau Marmont', 34.0980, -118.3692, 'West Hollywood', 'members_club', 'la', false, false, 118),
('Elephante', 34.0905, -118.3855, 'West Hollywood', 'members_club', 'la', false, false, 119),
('Bird Streets Club', 34.1050, -118.3800, 'Hollywood Hills', 'members_club', 'la', false, false, 120),
('Delilah', 34.0815, -118.3795, 'West Hollywood', 'members_club', 'la', false, false, 121)
ON CONFLICT (name) DO NOTHING;