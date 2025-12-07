-- Insert 8 new Santa Monica / Venice / Manhattan Beach venues
INSERT INTO venues (name, lat, lng, neighborhood, type, city, is_demo, is_promoted, popularity_rank)
VALUES
  ('The Galley', 34.0082, -118.4889, 'Santa Monica', 'bar', 'la', false, false, 12),
  ('Finn McCool''s', 34.0057, -118.4799, 'Santa Monica', 'bar', 'la', false, false, 13),
  ('The Basement Tavern', 34.0134, -118.4917, 'Santa Monica', 'bar', 'la', false, false, 14),
  ('The Roosterfish', 33.9920, -118.4715, 'Venice', 'bar', 'la', false, false, 15),
  ('The Townhouse & Del Monte Speakeasy', 33.9934, -118.4701, 'Venice', 'bar', 'la', false, false, 16),
  ('High Rooftop Lounge', 33.9913, -118.4660, 'Venice', 'lounge', 'la', false, false, 17),
  ('Simmzy''s Manhattan Beach', 33.8846, -118.4094, 'Manhattan Beach', 'bar', 'la', false, false, 18)
ON CONFLICT (name) DO NOTHING;