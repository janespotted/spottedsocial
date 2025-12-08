-- Add LA venues using unique names to avoid conflicts

-- SANTA MONICA (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Bungalow Santa Monica', 34.0125, -118.4975, 'Santa Monica', 'cocktail_bar', 'la', 1, false, false),
('Harvelle''s Blues', 34.0135, -118.4945, 'Santa Monica', 'nightclub', 'la', 2, false, false),
('Copa d''Oro SM', 34.0155, -118.4925, 'Santa Monica', 'bar', 'la', 3, false, false),
('The Victorian SM', 34.0145, -118.4935, 'Santa Monica', 'bar', 'la', 4, false, false),
('Chez Jay SM', 34.0165, -118.5005, 'Santa Monica', 'bar', 'la', 5, false, false),
('The Misfit SM', 34.0175, -118.4895, 'Santa Monica', 'bar', 'la', 6, false, false),
('Basement Tavern SM', 34.0185, -118.4885, 'Santa Monica', 'bar', 'la', 7, false, false),
('Big Dean''s SM', 34.0095, -118.4985, 'Santa Monica', 'bar', 'la', 8, false, false),
('The Galley SM', 34.0205, -118.4865, 'Santa Monica', 'bar', 'la', 9, false, false),
('Britannia Pub SM', 34.0195, -118.4875, 'Santa Monica', 'bar', 'la', 10, false, false),
('King''s Head SM', 34.0215, -118.4855, 'Santa Monica', 'bar', 'la', 11, false, false),
('The Albright SM', 34.0085, -118.4995, 'Santa Monica', 'bar', 'la', 12, false, false),
('Father''s Office Santa Monica', 34.0225, -118.4845, 'Santa Monica', 'bar', 'la', 13, false, false),
('Dogtown Coffee SM', 34.0235, -118.4835, 'Santa Monica', 'bar', 'la', 14, false, false),
('Independence SM', 34.0245, -118.4825, 'Santa Monica', 'bar', 'la', 15, false, false),
('Wokcano Santa Monica', 34.0255, -118.4815, 'Santa Monica', 'cocktail_bar', 'la', 16, false, false),
('O''Brien''s SM', 34.0265, -118.4805, 'Santa Monica', 'bar', 'la', 17, false, false),
('Arsenal SM', 34.0275, -118.4795, 'Santa Monica', 'bar', 'la', 18, false, false),
('Crafthouse Santa Monica', 34.0285, -118.4785, 'Santa Monica', 'bar', 'la', 19, false, false),
('Cabo Cantina Santa Monica', 34.0295, -118.4775, 'Santa Monica', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- WEST HOLLYWOOD (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('The Abbey WeHo', 34.0873, -118.3756, 'West Hollywood', 'nightclub', 'la', 1, false, false),
('Bootsy Bellows WeHo', 34.0883, -118.3876, 'West Hollywood', 'nightclub', 'la', 2, false, false),
('Whisky a Go Go WeHo', 34.0905, -118.3855, 'West Hollywood', 'nightclub', 'la', 3, false, false),
('Rainbow Bar and Grill', 34.0915, -118.3845, 'West Hollywood', 'bar', 'la', 4, false, false),
('Troubadour WeHo', 34.0825, -118.3795, 'West Hollywood', 'nightclub', 'la', 5, false, false),
('Chateau Marmont Bar', 34.0985, -118.3685, 'West Hollywood', 'cocktail_bar', 'la', 6, false, false),
('Skybar Mondrian', 34.0995, -118.3675, 'West Hollywood', 'rooftop', 'la', 7, false, false),
('Catch WeHo', 34.0865, -118.3895, 'West Hollywood', 'rooftop', 'la', 8, false, false),
('Nice Guy WeHo', 34.0835, -118.3905, 'West Hollywood', 'cocktail_bar', 'la', 9, false, false),
('Delilah WeHo', 34.0845, -118.3915, 'West Hollywood', 'cocktail_bar', 'la', 10, false, false),
('EP and LP WeHo', 34.0855, -118.3925, 'West Hollywood', 'rooftop', 'la', 11, false, false),
('Tesse WeHo', 34.0925, -118.3835, 'West Hollywood', 'bar', 'la', 12, false, false),
('Rocco''s West Hollywood', 34.0875, -118.3765, 'West Hollywood', 'bar', 'la', 13, false, false),
('Heart WeHo Club', 34.0885, -118.3755, 'West Hollywood', 'nightclub', 'la', 14, false, false),
('Micky''s West Hollywood', 34.0895, -118.3745, 'West Hollywood', 'nightclub', 'la', 15, false, false),
('Chapel at Abbey', 34.0872, -118.3758, 'West Hollywood', 'bar', 'la', 16, false, false),
('Rage WeHo', 34.0882, -118.3748, 'West Hollywood', 'nightclub', 'la', 17, false, false),
('Gym Sportsbar West Hollywood', 34.0892, -118.3738, 'West Hollywood', 'bar', 'la', 18, false, false),
('Mother Lode WeHo', 34.0902, -118.3728, 'West Hollywood', 'bar', 'la', 19, false, false),
('Flaming Saddles WeHo', 34.0912, -118.3718, 'West Hollywood', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- SILVER LAKE (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Satellite Silver Lake', 34.0805, -118.2695, 'Silver Lake', 'nightclub', 'la', 1, false, false),
('Thirsty Crow SL', 34.0815, -118.2685, 'Silver Lake', 'bar', 'la', 2, false, false),
('The Virgil SL', 34.0825, -118.2675, 'Silver Lake', 'nightclub', 'la', 3, false, false),
('Cha Cha Lounge SL', 34.0835, -118.2665, 'Silver Lake', 'bar', 'la', 4, false, false),
('Akbar Silver Lake', 34.0845, -118.2705, 'Silver Lake', 'bar', 'la', 5, false, false),
('4100 Bar SL', 34.0855, -118.2715, 'Silver Lake', 'bar', 'la', 6, false, false),
('Red Lion Tavern SL', 34.0865, -118.2725, 'Silver Lake', 'bar', 'la', 7, false, false),
('Silverlake Lounge Bar', 34.0875, -118.2735, 'Silver Lake', 'cocktail_bar', 'la', 8, false, false),
('Tenants of Trees', 34.0885, -118.2745, 'Silver Lake', 'bar', 'la', 9, false, false),
('Black Cat Silver Lake', 34.0795, -118.2655, 'Silver Lake', 'bar', 'la', 10, false, false),
('Bar Stella SL', 34.0905, -118.2765, 'Silver Lake', 'bar', 'la', 11, false, false),
('Cliff''s Edge Silver Lake', 34.0915, -118.2775, 'Silver Lake', 'cocktail_bar', 'la', 12, false, false),
('Hyperion Public SL', 34.0925, -118.2785, 'Silver Lake', 'bar', 'la', 13, false, false),
('L and E Oyster Bar', 34.0935, -118.2795, 'Silver Lake', 'bar', 'la', 14, false, false),
('Sycamore Silver Lake', 34.0945, -118.2805, 'Silver Lake', 'bar', 'la', 15, false, false),
('Night Owl Silver Lake', 34.0955, -118.2815, 'Silver Lake', 'bar', 'la', 16, false, false),
('Edendale SL', 34.0965, -118.2825, 'Silver Lake', 'bar', 'la', 17, false, false),
('Silverlake Wine Bar', 34.0975, -118.2835, 'Silver Lake', 'bar', 'la', 18, false, false),
('El Cid Silver Lake', 34.0985, -118.2845, 'Silver Lake', 'nightclub', 'la', 19, false, false),
('Mohawk Bend Silver Lake', 34.0995, -118.2855, 'Silver Lake', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- VENICE (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('The Brig Venice', 33.9925, -118.4645, 'Venice', 'bar', 'la', 1, false, false),
('High Venice Rooftop', 33.9935, -118.4735, 'Venice', 'rooftop', 'la', 2, false, false),
('Venice Whaler', 33.9845, -118.4725, 'Venice', 'bar', 'la', 3, false, false),
('Hinano Cafe Venice', 33.9855, -118.4735, 'Venice', 'bar', 'la', 4, false, false),
('Townhouse Del Monte', 33.9865, -118.4655, 'Venice', 'bar', 'la', 5, false, false),
('The Otheroom Venice', 33.9875, -118.4665, 'Venice', 'bar', 'la', 6, false, false),
('Wurstkuche Arts District', 33.9885, -118.4675, 'Venice', 'bar', 'la', 7, false, false),
('Gjelina Venice', 33.9895, -118.4685, 'Venice', 'cocktail_bar', 'la', 8, false, false),
('Waterfront Venice', 33.9835, -118.4745, 'Venice', 'bar', 'la', 9, false, false),
('Venice Ale House Bar', 33.9905, -118.4695, 'Venice', 'bar', 'la', 10, false, false),
('James Beach Venice', 33.9915, -118.4705, 'Venice', 'bar', 'la', 11, false, false),
('Larry''s Venice Beach', 33.9945, -118.4655, 'Venice', 'bar', 'la', 12, false, false),
('Sunny Spot Venice', 33.9955, -118.4665, 'Venice', 'bar', 'la', 13, false, false),
('Canal Club Venice', 33.9965, -118.4675, 'Venice', 'bar', 'la', 14, false, false),
('Scopa Italian Venice', 33.9975, -118.4685, 'Venice', 'cocktail_bar', 'la', 15, false, false),
('Tasting Kitchen Venice', 33.9985, -118.4695, 'Venice', 'cocktail_bar', 'la', 16, false, false),
('Butcher''s Daughter Venice', 33.9995, -118.4705, 'Venice', 'bar', 'la', 17, false, false),
('Rose Cafe Abbot Kinney', 34.0005, -118.4715, 'Venice', 'bar', 'la', 18, false, false),
('Intelligentsia Abbot Kinney', 34.0015, -118.4725, 'Venice', 'bar', 'la', 19, false, false),
('Blue Bottle Abbot Kinney', 34.0025, -118.4735, 'Venice', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- HOLLYWOOD (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Avalon Hollywood Club', 34.1015, -118.3255, 'Hollywood', 'nightclub', 'la', 1, false, false),
('No Vacancy Hollywood', 34.1025, -118.3265, 'Hollywood', 'cocktail_bar', 'la', 2, false, false),
('Highlight Room Hollywood', 34.1035, -118.3275, 'Hollywood', 'rooftop', 'la', 3, false, false),
('Davey Wayne''s Hollywood', 34.1045, -118.3285, 'Hollywood', 'bar', 'la', 4, false, false),
('Musso and Frank Hollywood', 34.1005, -118.3305, 'Hollywood', 'bar', 'la', 5, false, false),
('Boardner''s Hollywood', 34.1055, -118.3295, 'Hollywood', 'bar', 'la', 6, false, false),
('Three Clubs Hollywood', 34.0995, -118.3315, 'Hollywood', 'bar', 'la', 7, false, false),
('Frolic Room Hollywood', 34.1065, -118.3245, 'Hollywood', 'bar', 'la', 8, false, false),
('La Descarga Hollywood', 34.0985, -118.3325, 'Hollywood', 'cocktail_bar', 'la', 9, false, false),
('Harvard and Stone Hollywood', 34.0975, -118.2985, 'Hollywood', 'bar', 'la', 10, false, false),
('Lost Property Hollywood', 34.1075, -118.3235, 'Hollywood', 'bar', 'la', 11, false, false),
('The Well Hollywood Bar', 34.0965, -118.3335, 'Hollywood', 'bar', 'la', 12, false, false),
('Sassafras Hollywood', 34.1085, -118.3225, 'Hollywood', 'bar', 'la', 13, false, false),
('Dirty Laundry Hollywood', 34.0955, -118.3345, 'Hollywood', 'bar', 'la', 14, false, false),
('Pour Vous Hollywood', 34.0945, -118.3355, 'Hollywood', 'cocktail_bar', 'la', 15, false, false),
('Spare Room Hollywood', 34.1095, -118.3215, 'Hollywood', 'bar', 'la', 16, false, false),
('Piano Bar Hollywood Blvd', 34.0935, -118.3365, 'Hollywood', 'bar', 'la', 17, false, false),
('Black Rabbit Rose Hollywood', 34.0925, -118.3375, 'Hollywood', 'cocktail_bar', 'la', 18, false, false),
('Roger Room Hollywood', 34.0915, -118.3385, 'Hollywood', 'bar', 'la', 19, false, false),
('Formosa Cafe Hollywood', 34.0905, -118.3395, 'Hollywood', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- DOWNTOWN LA
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('The Edison DTLA', 34.0455, -118.2515, 'Downtown LA', 'cocktail_bar', 'la', 1, false, false),
('Clifton''s Cafeteria', 34.0465, -118.2525, 'Downtown LA', 'bar', 'la', 2, false, false),
('Seven Grand DTLA', 34.0475, -118.2535, 'Downtown LA', 'bar', 'la', 3, false, false),
('The Varnish Downtown', 34.0485, -118.2545, 'Downtown LA', 'cocktail_bar', 'la', 4, false, false),
('Pattern Bar DTLA', 34.0495, -118.2555, 'Downtown LA', 'bar', 'la', 5, false, false),
('Everson Royce Arts District', 34.0405, -118.2385, 'Downtown LA', 'bar', 'la', 6, false, false),
('Broken Shaker Downtown', 34.0415, -118.2395, 'Downtown LA', 'bar', 'la', 7, false, false),
('71Above DTLA', 34.0505, -118.2565, 'Downtown LA', 'rooftop', 'la', 8, false, false),
('Perch DTLA', 34.0515, -118.2575, 'Downtown LA', 'rooftop', 'la', 9, false, false),
('Standard Downtown Rooftop', 34.0525, -118.2585, 'Downtown LA', 'rooftop', 'la', 10, false, false),
('Upstairs at Ace DTLA', 34.0535, -118.2595, 'Downtown LA', 'rooftop', 'la', 11, false, false),
('Bar Clacson DTLA', 34.0545, -118.2605, 'Downtown LA', 'bar', 'la', 12, false, false),
('Bavel Arts District', 34.0425, -118.2405, 'Downtown LA', 'cocktail_bar', 'la', 13, false, false),
('Redbird DTLA', 34.0555, -118.2615, 'Downtown LA', 'cocktail_bar', 'la', 14, false, false),
('Cole''s French Dip', 34.0565, -118.2625, 'Downtown LA', 'bar', 'la', 15, false, false),
('Far Bar Little Tokyo', 34.0435, -118.2415, 'Downtown LA', 'bar', 'la', 16, false, false),
('Las Perlas DTLA', 34.0575, -118.2495, 'Downtown LA', 'bar', 'la', 17, false, false),
('The Wolves Downtown', 34.0445, -118.2425, 'Downtown LA', 'bar', 'la', 18, false, false),
('Escondite DTLA', 34.0585, -118.2485, 'Downtown LA', 'bar', 'la', 19, false, false),
('Golden Gopher DTLA', 34.0595, -118.2475, 'Downtown LA', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- ECHO PARK (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('The Echo EP', 34.0785, -118.2595, 'Echo Park', 'nightclub', 'la', 1, false, false),
('Echoplex Echo Park', 34.0795, -118.2585, 'Echo Park', 'nightclub', 'la', 2, false, false),
('Little Joy Echo Park', 34.0805, -118.2575, 'Echo Park', 'bar', 'la', 3, false, false),
('Short Stop Echo Park', 34.0815, -118.2605, 'Echo Park', 'bar', 'la', 4, false, false),
('Button Mash EP', 34.0825, -118.2615, 'Echo Park', 'bar', 'la', 5, false, false),
('Semi-Tropic EP', 34.0835, -118.2625, 'Echo Park', 'bar', 'la', 6, false, false),
('Sunset Beer Echo Park', 34.0845, -118.2635, 'Echo Park', 'bar', 'la', 7, false, false),
('Masa of EP', 34.0855, -118.2645, 'Echo Park', 'bar', 'la', 8, false, false),
('Mohawk Bend Echo Park', 34.0865, -118.2655, 'Echo Park', 'bar', 'la', 9, false, false),
('Taix French Restaurant', 34.0875, -118.2665, 'Echo Park', 'bar', 'la', 10, false, false),
('1642 EP', 34.0885, -118.2675, 'Echo Park', 'bar', 'la', 11, false, false),
('Elf Cafe EP', 34.0895, -118.2685, 'Echo Park', 'bar', 'la', 12, false, false),
('Stories Echo Park', 34.0905, -118.2695, 'Echo Park', 'bar', 'la', 13, false, false),
('Winsome EP', 34.0915, -118.2705, 'Echo Park', 'bar', 'la', 14, false, false),
('Cookbook Echo Park', 34.0925, -118.2715, 'Echo Park', 'bar', 'la', 15, false, false),
('Eastside Market EP', 34.0935, -118.2725, 'Echo Park', 'bar', 'la', 16, false, false),
('Sunset Vinyl EP', 34.0945, -118.2735, 'Echo Park', 'bar', 'la', 17, false, false),
('Lassen''s Echo Park', 34.0955, -118.2745, 'Echo Park', 'bar', 'la', 18, false, false),
('Sage Bistro EP', 34.0965, -118.2755, 'Echo Park', 'bar', 'la', 19, false, false),
('Lady Byrd EP', 34.0975, -118.2765, 'Echo Park', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- KOREATOWN (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Lock and Key Ktown', 34.0615, -118.3055, 'Koreatown', 'cocktail_bar', 'la', 1, false, false),
('Dan Sung Sa Ktown', 34.0625, -118.3065, 'Koreatown', 'bar', 'la', 2, false, false),
('The Prince Ktown', 34.0635, -118.3075, 'Koreatown', 'bar', 'la', 3, false, false),
('HMS Bounty Ktown', 34.0645, -118.3085, 'Koreatown', 'bar', 'la', 4, false, false),
('LINE Hotel Rooftop', 34.0655, -118.3095, 'Koreatown', 'rooftop', 'la', 5, false, false),
('Break Room 86 Ktown', 34.0665, -118.3105, 'Koreatown', 'bar', 'la', 6, false, false),
('Normandie Club Ktown', 34.0675, -118.3115, 'Koreatown', 'cocktail_bar', 'la', 7, false, false),
('Escala Koreatown', 34.0685, -118.3125, 'Koreatown', 'cocktail_bar', 'la', 8, false, false),
('Rosen Ktown', 34.0695, -118.3135, 'Koreatown', 'bar', 'la', 9, false, false),
('Pot Koreatown', 34.0705, -118.3145, 'Koreatown', 'bar', 'la', 10, false, false),
('Brass Monkey Ktown', 34.0715, -118.3155, 'Koreatown', 'bar', 'la', 11, false, false),
('R Bar Ktown', 34.0725, -118.3165, 'Koreatown', 'bar', 'la', 12, false, false),
('Madame Siam Ktown', 34.0735, -118.3175, 'Koreatown', 'bar', 'la', 13, false, false),
('Frank n Hank Ktown', 34.0745, -118.3185, 'Koreatown', 'bar', 'la', 14, false, false),
('The Wilton Ktown', 34.0755, -118.3195, 'Koreatown', 'bar', 'la', 15, false, false),
('Dino''s Chicken Ktown', 34.0765, -118.3205, 'Koreatown', 'bar', 'la', 16, false, false),
('Ka''Teen Ktown', 34.0775, -118.3215, 'Koreatown', 'bar', 'la', 17, false, false),
('Genwa Ktown', 34.0785, -118.3225, 'Koreatown', 'bar', 'la', 18, false, false),
('Soban Ktown', 34.0795, -118.3235, 'Koreatown', 'bar', 'la', 19, false, false),
('Quarters Ktown', 34.0805, -118.3245, 'Koreatown', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- LOS FELIZ (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Dresden Los Feliz', 34.1075, -118.2885, 'Los Feliz', 'cocktail_bar', 'la', 1, false, false),
('Ye Rustic Inn LF', 34.1085, -118.2895, 'Los Feliz', 'bar', 'la', 2, false, false),
('Covell Los Feliz', 34.1095, -118.2905, 'Los Feliz', 'bar', 'la', 3, false, false),
('Tiki-Ti Los Feliz', 34.1105, -118.2915, 'Los Feliz', 'bar', 'la', 4, false, false),
('Bigfoot Lodge LF', 34.1115, -118.2925, 'Los Feliz', 'bar', 'la', 5, false, false),
('Atrium Los Feliz', 34.1125, -118.2935, 'Los Feliz', 'bar', 'la', 6, false, false),
('Messhall LF', 34.1135, -118.2945, 'Los Feliz', 'bar', 'la', 7, false, false),
('Homestate Los Feliz', 34.1145, -118.2955, 'Los Feliz', 'bar', 'la', 8, false, false),
('Rockwell LF', 34.1155, -118.2965, 'Los Feliz', 'cocktail_bar', 'la', 9, false, false),
('All Time Los Feliz', 34.1165, -118.2975, 'Los Feliz', 'bar', 'la', 10, false, false),
('Little Dom''s LF', 34.1175, -118.2985, 'Los Feliz', 'bar', 'la', 11, false, false),
('Figaro Los Feliz', 34.1185, -118.2995, 'Los Feliz', 'bar', 'la', 12, false, false),
('Alcove Los Feliz', 34.1195, -118.3005, 'Los Feliz', 'bar', 'la', 13, false, false),
('Fred 62 Los Feliz', 34.1205, -118.3015, 'Los Feliz', 'bar', 'la', 14, false, false),
('Vermont Los Feliz', 34.1215, -118.2915, 'Los Feliz', 'bar', 'la', 15, false, false),
('Cliff''s Edge Los Feliz', 34.1225, -118.2925, 'Los Feliz', 'cocktail_bar', 'la', 16, false, false),
('Jeni''s Los Feliz', 34.1235, -118.2935, 'Los Feliz', 'bar', 'la', 17, false, false),
('Proof LF', 34.1245, -118.2945, 'Los Feliz', 'bar', 'la', 18, false, false),
('Kismet Los Feliz', 34.1255, -118.2955, 'Los Feliz', 'bar', 'la', 19, false, false),
('Fern Dell LF', 34.1265, -118.2965, 'Los Feliz', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- HIGHLAND PARK (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Hermosillo HP', 34.1155, -118.1955, 'Highland Park', 'bar', 'la', 1, false, false),
('Block Party Highland Park', 34.1165, -118.1965, 'Highland Park', 'bar', 'la', 2, false, false),
('Hi Hat HP', 34.1175, -118.1975, 'Highland Park', 'nightclub', 'la', 3, false, false),
('ETA Highland Park', 34.1185, -118.1985, 'Highland Park', 'bar', 'la', 4, false, false),
('Good Luck HP', 34.1195, -118.1995, 'Highland Park', 'bar', 'la', 5, false, false),
('Checker Hall HP', 34.1205, -118.2005, 'Highland Park', 'nightclub', 'la', 6, false, false),
('Civil Coffee HP', 34.1215, -118.2015, 'Highland Park', 'bar', 'la', 7, false, false),
('Congregation HP', 34.1225, -118.2025, 'Highland Park', 'bar', 'la', 8, false, false),
('Triple Beam HP', 34.1235, -118.2035, 'Highland Park', 'bar', 'la', 9, false, false),
('Kitchen Mouse HP', 34.1245, -118.2045, 'Highland Park', 'bar', 'la', 10, false, false),
('Joy Highland Park', 34.1255, -118.2055, 'Highland Park', 'bar', 'la', 11, false, false),
('Cafe de Leche HP', 34.1265, -118.2065, 'Highland Park', 'bar', 'la', 12, false, false),
('Blind Barber Highland Park', 34.1275, -118.2075, 'Highland Park', 'bar', 'la', 13, false, false),
('Johnny''s HP', 34.1285, -118.2085, 'Highland Park', 'bar', 'la', 14, false, false),
('Town Pizza HP', 34.1295, -118.2095, 'Highland Park', 'bar', 'la', 15, false, false),
('Polka HP', 34.1305, -118.2105, 'Highland Park', 'bar', 'la', 16, false, false),
('Huaraches HP', 34.1315, -118.2115, 'Highland Park', 'bar', 'la', 17, false, false),
('Greyhound HP', 34.1325, -118.2125, 'Highland Park', 'bar', 'la', 18, false, false),
('Avenue 50 HP', 34.1335, -118.2135, 'Highland Park', 'bar', 'la', 19, false, false),
('Sonny''s HP', 34.1345, -118.2145, 'Highland Park', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- MID-WILSHIRE (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('Roosevelt Mid-Wilshire', 34.0625, -118.3385, 'Mid-Wilshire', 'bar', 'la', 1, false, false),
('El Carmen MW', 34.0635, -118.3395, 'Mid-Wilshire', 'bar', 'la', 2, false, false),
('Sixth MW', 34.0645, -118.3405, 'Mid-Wilshire', 'bar', 'la', 3, false, false),
('La Cita MW', 34.0655, -118.3415, 'Mid-Wilshire', 'bar', 'la', 4, false, false),
('Sayers Club MW', 34.0665, -118.3425, 'Mid-Wilshire', 'nightclub', 'la', 5, false, false),
('Here''s Looking MW', 34.0675, -118.3255, 'Mid-Wilshire', 'cocktail_bar', 'la', 6, false, false),
('Republique Mid-Wilshire', 34.0685, -118.3265, 'Mid-Wilshire', 'bar', 'la', 7, false, false),
('Cassell''s MW', 34.0695, -118.3275, 'Mid-Wilshire', 'bar', 'la', 8, false, false),
('Gorbals MW', 34.0705, -118.3285, 'Mid-Wilshire', 'bar', 'la', 9, false, false),
('Openaire MW', 34.0715, -118.3295, 'Mid-Wilshire', 'rooftop', 'la', 10, false, false),
('Ray''s Mid-Wilshire', 34.0725, -118.3305, 'Mid-Wilshire', 'bar', 'la', 11, false, false),
('Mama Shelter MW', 34.0735, -118.3315, 'Mid-Wilshire', 'rooftop', 'la', 12, false, false),
('Walker Inn MW', 34.0745, -118.3325, 'Mid-Wilshire', 'cocktail_bar', 'la', 13, false, false),
('Petty Cash MW', 34.0755, -118.3335, 'Mid-Wilshire', 'bar', 'la', 14, false, false),
('Baldoria MW', 34.0765, -118.3345, 'Mid-Wilshire', 'bar', 'la', 15, false, false),
('AOC Mid-Wilshire', 34.0775, -118.3355, 'Mid-Wilshire', 'bar', 'la', 16, false, false),
('Chi Spacca MW', 34.0785, -118.3365, 'Mid-Wilshire', 'bar', 'la', 17, false, false),
('Mozza Pizzeria MW', 34.0795, -118.3375, 'Mid-Wilshire', 'bar', 'la', 18, false, false),
('Mozza Osteria MW', 34.0805, -118.3385, 'Mid-Wilshire', 'bar', 'la', 19, false, false),
('Stark Bar MW', 34.0815, -118.3395, 'Mid-Wilshire', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name);

-- MANHATTAN BEACH (LA)
INSERT INTO venues (name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted) 
SELECT * FROM (VALUES
('MB Brewing Co', 33.8875, -118.4075, 'Manhattan Beach', 'bar', 'la', 1, false, false),
('Strand House MB', 33.8885, -118.4135, 'Manhattan Beach', 'rooftop', 'la', 2, false, false),
('Ercoles MB', 33.8825, -118.4095, 'Manhattan Beach', 'bar', 'la', 3, false, false),
('Shellback MB', 33.8835, -118.4105, 'Manhattan Beach', 'bar', 'la', 4, false, false),
('Fishing Dynamite MB', 33.8845, -118.4115, 'Manhattan Beach', 'bar', 'la', 5, false, false),
('Local Yolk MB', 33.8855, -118.4125, 'Manhattan Beach', 'bar', 'la', 6, false, false),
('Simmzy''s Manhattan Beach', 33.8865, -118.4065, 'Manhattan Beach', 'bar', 'la', 7, false, false),
('MB Post Bar', 33.8895, -118.4085, 'Manhattan Beach', 'bar', 'la', 8, false, false),
('Rock n Fish MB', 33.8905, -118.4145, 'Manhattan Beach', 'bar', 'la', 9, false, false),
('Kettle MB', 33.8815, -118.4085, 'Manhattan Beach', 'bar', 'la', 10, false, false),
('MB Country Club', 33.8915, -118.4155, 'Manhattan Beach', 'cocktail_bar', 'la', 11, false, false),
('Pancho''s Manhattan Beach', 33.8925, -118.4095, 'Manhattan Beach', 'bar', 'la', 12, false, false),
('Pierre MB', 33.8935, -118.4105, 'Manhattan Beach', 'bar', 'la', 13, false, false),
('Love Salt MB', 33.8945, -118.4115, 'Manhattan Beach', 'bar', 'la', 14, false, false),
('El Sombrero MB', 33.8955, -118.4125, 'Manhattan Beach', 'bar', 'la', 15, false, false),
('Houston''s Manhattan Beach', 33.8965, -118.4075, 'Manhattan Beach', 'bar', 'la', 16, false, false),
('Uncle Bill''s MB', 33.8975, -118.4135, 'Manhattan Beach', 'bar', 'la', 17, false, false),
('Zinc Shade Hotel', 33.8985, -118.4145, 'Manhattan Beach', 'cocktail_bar', 'la', 18, false, false),
('Arthur J MB', 33.8995, -118.4155, 'Manhattan Beach', 'bar', 'la', 19, false, false),
('North End MB', 33.9005, -118.4065, 'Manhattan Beach', 'bar', 'la', 20, false, false)
) AS v(name, lat, lng, neighborhood, type, city, popularity_rank, is_demo, is_promoted)
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE venues.name = v.name)