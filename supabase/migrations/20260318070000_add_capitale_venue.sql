-- Add Capitale (130 Bowery, NYC) as a venue
INSERT INTO venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank)
VALUES
  ('Capitale', 40.7189, -73.9937, 'Bowery', 'other', 'nyc', false, false, 0)
ON CONFLICT (name) DO NOTHING;
