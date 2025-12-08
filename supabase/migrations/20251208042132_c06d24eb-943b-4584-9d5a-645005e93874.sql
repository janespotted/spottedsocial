-- Fix LA venue types: nightclub -> bar
UPDATE public.venues SET type = 'bar' WHERE name IN (
  'Finn McCool''s',
  '1642',
  'Simmzy''s Manhattan Beach',
  'The Bungalow',
  'The York',
  'Tenants of the Trees',
  'The Echo EP',
  'The Echoplex',
  'Echoplex Echo Park',
  'Hi Hat HP',
  'Checker Hall HP',
  'El Cid Silver Lake',
  'The Virgil SL',
  'Troubadour WeHo',
  'Whisky a Go Go WeHo',
  'Satellite Silver Lake',
  'Harvelle''s Blues'
);

-- Fix LA venue types: nightclub -> rooftop
UPDATE public.venues SET type = 'rooftop' WHERE name IN (
  'High Rooftop Lounge',
  'EP & LP',
  'Skybar'
);

-- Fix LA venue types: nightclub -> cocktail_bar
UPDATE public.venues SET type = 'cocktail_bar' WHERE name IN (
  'The Roger Room',
  'Break Room 86'
);

-- Fix NYC venue types: nightclub -> bar
UPDATE public.venues SET type = 'bar' WHERE name IN (
  'Arlene''s Grocery',
  'Baby''s All Right',
  'Pianos LES',
  'The Delancey',
  'Bossa Nova Civic',
  'Littlefield CG',
  'Mercury Lounge LES',
  'Rockwood Music Hall',
  'Bell House CG',
  'Brooklyn Bowl WB',
  'Rough Trade WB',
  'Warsaw GP',
  'Trans-Pecos RW',
  'TV Eye RW'
);

-- Fix NYC venue types: nightclub -> cocktail_bar (jazz clubs)
UPDATE public.venues SET type = 'cocktail_bar' WHERE name IN (
  '55 Bar WV',
  'Blue Note WV',
  'Smalls Jazz WV',
  'Village Vanguard',
  'Birdland NYC',
  'Iridium NYC',
  'The Django SoHo',
  'Joe''s Pub EV',
  'Nublu EV'
);

-- Remove duplicate venues (keep the shorter/cleaner named version)
DELETE FROM public.venues WHERE name IN (
  'Elsewhere BW',
  'House of Yes BK',
  'Good Room GP',
  'Nowadays RW',
  'The Box LES',
  'Echoplex Echo Park',
  'The Echo EP',
  'Avalon Hollywood Club'
);