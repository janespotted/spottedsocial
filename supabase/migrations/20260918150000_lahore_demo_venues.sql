-- ═════════════════════════════════════════════════════════════════════
-- Lahore demo venues (dev/QA only).
--
-- Real, recognisable Lahore spots with true coordinates, so venue
-- detection, arrival prompts, the map and the leaderboard can be exercised
-- from Lahore instead of against New York. Every row is is_demo = true, so
-- the existing `.eq('is_demo', false)` filters keep them out of any build
-- with demo mode off — which is every release build and every real user.
--
-- Note on types: Pakistan has no licensed bars, so Lahore nightlife is
-- restaurants, rooftops, cafés and lounges. Types are chosen from the
-- existing vocabulary (restaurant / rooftop / lounge / cafe→other) so the
-- venue-type map filter keeps working unchanged.
-- ═════════════════════════════════════════════════════════════════════

insert into public.venues (name, neighborhood, type, lat, lng, city, is_demo, popularity_rank)
values
  -- Gulberg — the main dining and café strip
  ('Cosa Nostra',            'Gulberg',        'restaurant', 31.5163, 74.3486, 'lhr', true, 1),
  ('Yum Chinese & Thai',     'Gulberg',        'restaurant', 31.5204, 74.3536, 'lhr', true, 5),
  ('Cafe Aylanto',           'Gulberg',        'restaurant', 31.5188, 74.3510, 'lhr', true, 2),
  ('Freddy''s Cafe',         'Gulberg',        'other',      31.5147, 74.3459, 'lhr', true, 9),
  ('Gloria Jean''s Coffees', 'Gulberg',        'other',      31.5171, 74.3495, 'lhr', true, 16),
  ('Spice Bazaar',           'Gulberg',        'restaurant', 31.5155, 74.3472, 'lhr', true, 12),

  -- MM Alam Road — the best-known restaurant row
  ('Tuscany Courtyard',      'MM Alam Road',   'restaurant', 31.5142, 74.3452, 'lhr', true, 4),
  ('Butt Karahi',            'MM Alam Road',   'restaurant', 31.5136, 74.3441, 'lhr', true, 7),
  ('Arcadian Cafe',          'MM Alam Road',   'other',      31.5150, 74.3466, 'lhr', true, 13),
  ('English Tea House',      'MM Alam Road',   'other',      31.5128, 74.3430, 'lhr', true, 11),

  -- DHA — newer, younger crowd
  ('Kitchen Cuisine',        'DHA Phase 5',    'restaurant', 31.4697, 74.4058, 'lhr', true, 8),
  ('Rina''s Kitchenette',    'DHA Phase 3',    'restaurant', 31.4802, 74.3931, 'lhr', true, 10),
  ('Sumo Japanese',          'DHA Phase 6',    'restaurant', 31.4741, 74.4231, 'lhr', true, 15),
  ('Chaayé Khana',           'DHA Phase 4',    'other',      31.4768, 74.4015, 'lhr', true, 17),
  ('Amavi',                  'DHA Phase 6',    'lounge',     31.4726, 74.4198, 'lhr', true, 6),

  -- Old City / Food Street — rooftops over the Badshahi Mosque
  ('Haveli Restaurant',      'Fort Road',      'rooftop',    31.5880, 74.3096, 'lhr', true, 3),
  ('Cooco''s Den',           'Fort Road',      'rooftop',    31.5872, 74.3108, 'lhr', true, 14),
  ('Andaaz Restaurant',      'Fort Road',      'rooftop',    31.5885, 74.3089, 'lhr', true, 18),

  -- Johar Town / Model Town
  ('Monal Lahore',           'Johar Town',     'restaurant', 31.4685, 74.2721, 'lhr', true, 19),
  ('Cafe Zouk',              'Model Town',     'restaurant', 31.4842, 74.3287, 'lhr', true, 20)
on conflict do nothing;
