-- Leaderboard-specific classification; the map and venue catalog are preserved.
alter table public.venues
  add column leaderboard_category text check (leaderboard_category in ('bar', 'club')),
  add column leaderboard_exclusion_reason text,
  add column leaderboard_eligible boolean generated always as (
    coalesce(leaderboard_category in ('bar', 'club'), false)
    and coalesce(type in ('bar', 'cocktail_bar', 'club', 'nightclub'), false)
    and not coalesce(is_demo, false)
  ) stored;

comment on column public.venues.leaderboard_category is
  'Explicit leaderboard approval: bar or club. NULL keeps unreviewed discoveries out. Does not change map classification.';
comment on column public.venues.leaderboard_eligible is
  'Required by leaderboard reads, score recomputation, rank sync, promotions and signal collection.';
comment on column public.venues.leaderboard_exclusion_reason is
  'Why a catalog venue is excluded from nightlife rankings, or needs category review.';

update public.venues v set leaderboard_category = a.category, leaderboard_exclusion_reason = null
from (values
  ('la', '1642 EP', 'bar'),
  ('la', '4100 Bar SL', 'bar'),
  ('la', 'Academy LA', 'club'),
  ('la', 'Akbar Silver Lake', 'bar'),
  ('la', 'Apotheke', 'bar'),
  ('la', 'Arsenal SM', 'bar'),
  ('la', 'Avalon Hollywood', 'club'),
  ('la', 'Bar Clacson DTLA', 'bar'),
  ('la', 'Bar Lis', 'bar'),
  ('la', 'Bar Stella SL', 'bar'),
  ('la', 'Basement Tavern SM', 'bar'),
  ('la', 'Big Dean''s SM', 'bar'),
  ('la', 'Bigfoot Lodge LF', 'bar'),
  ('la', 'Black Rabbit Rose Hollywood', 'bar'),
  ('la', 'Blind Barber Highland Park', 'bar'),
  ('la', 'Block Party Highland Park', 'bar'),
  ('la', 'Boardner''s Hollywood', 'bar'),
  ('la', 'Brass Monkey Ktown', 'bar'),
  ('la', 'Break Room 86 Ktown', 'bar'),
  ('la', 'Britannia Pub SM', 'bar'),
  ('la', 'Broken Shaker Downtown', 'bar'),
  ('la', 'Bungalow Santa Monica', 'bar'),
  ('la', 'Button Mash EP', 'bar'),
  ('la', 'Cabo Cantina Santa Monica', 'bar'),
  ('la', 'Catch One', 'club'),
  ('la', 'Cha Cha Lounge SL', 'bar'),
  ('la', 'Chapel at Abbey', 'bar'),
  ('la', 'Chateau Marmont Bar', 'bar'),
  ('la', 'Club Tee Gee', 'bar'),
  ('la', 'Congregation HP', 'bar'),
  ('la', 'Copa d''Oro SM', 'bar'),
  ('la', 'Covell Los Feliz', 'bar'),
  ('la', 'Crafthouse Santa Monica', 'bar'),
  ('la', 'Dirty Laundry Hollywood', 'bar'),
  ('la', 'Dragonfly', 'club'),
  ('la', 'El Carmen MW', 'bar'),
  ('la', 'Ercoles MB', 'bar'),
  ('la', 'Everson Royce Arts District', 'bar'),
  ('la', 'Exchange LA', 'club'),
  ('la', 'Far Bar Little Tokyo', 'bar'),
  ('la', 'Father''s Office Santa Monica', 'bar'),
  ('la', 'Flaming Saddles WeHo', 'bar'),
  ('la', 'Frank n Hank Ktown', 'bar'),
  ('la', 'Frolic Room Hollywood', 'bar'),
  ('la', 'Golden Gopher DTLA', 'bar'),
  ('la', 'Good Luck HP', 'bar'),
  ('la', 'Greyhound HP', 'bar'),
  ('la', 'Gym Sportsbar West Hollywood', 'bar'),
  ('la', 'Harvard and Stone Hollywood', 'bar'),
  ('la', 'Heart WeHo Club', 'club'),
  ('la', 'Hermosillo HP', 'bar'),
  ('la', 'Hinano Cafe Venice', 'bar'),
  ('la', 'HMS Bounty Ktown', 'bar'),
  ('la', 'Hyde Sunset', 'club'),
  ('la', 'Keys', 'club'),
  ('la', 'King''s Head SM', 'bar'),
  ('la', 'Kiss Kiss Bang Bang', 'club'),
  ('la', 'La Cita MW', 'bar'),
  ('la', 'La Descarga Hollywood', 'bar'),
  ('la', 'Las Perlas DTLA', 'bar'),
  ('la', 'Little Joy Echo Park', 'bar'),
  ('la', 'Lock and Key Ktown', 'bar'),
  ('la', 'Los Globos', 'club'),
  ('la', 'Lost Property Hollywood', 'bar'),
  ('la', 'Madame Siam Ktown', 'bar'),
  ('la', 'Micky''s West Hollywood', 'club'),
  ('la', 'Mother Lode WeHo', 'bar'),
  ('la', 'Night Owl Silver Lake', 'bar'),
  ('la', 'No Vacancy Hollywood', 'bar'),
  ('la', 'Normandie Club Ktown', 'bar'),
  ('la', 'North End MB', 'bar'),
  ('la', 'O''Brien''s SM', 'bar'),
  ('la', 'Offsunset', 'club'),
  ('la', 'Pattern Bar DTLA', 'bar'),
  ('la', 'Piano Bar Hollywood Blvd', 'bar'),
  ('la', 'Poppy', 'club'),
  ('la', 'Pour Vous Hollywood', 'bar'),
  ('la', 'R Bar Ktown', 'bar'),
  ('la', 'Rage WeHo', 'club'),
  ('la', 'Rainbow Bar and Grill', 'bar'),
  ('la', 'Raspoutine', 'club'),
  ('la', 'Red Lion Tavern SL', 'bar'),
  ('la', 'Rocco''s West Hollywood', 'bar'),
  ('la', 'Roger Room Hollywood', 'bar'),
  ('la', 'Sassafras Hollywood', 'bar'),
  ('la', 'Sayers Club MW', 'club'),
  ('la', 'Semi-Tropic EP', 'bar'),
  ('la', 'Shellback MB', 'bar'),
  ('la', 'Short Stop Echo Park', 'bar'),
  ('la', 'Sonny''s HP', 'bar'),
  ('la', 'Spare Room Hollywood', 'bar'),
  ('la', 'Stark Bar MW', 'bar'),
  ('la', 'Sunset Beer Echo Park', 'bar'),
  ('la', 'Sunset Vinyl EP', 'bar'),
  ('la', 'The Abbey WeHo', 'club'),
  ('la', 'The Brig Venice', 'bar'),
  ('la', 'The Lighthouse Café', 'club'),
  ('la', 'The Otheroom Venice', 'bar'),
  ('la', 'The Rainbow Bar and Grill', 'club'),
  ('la', 'The Victorian SM', 'bar'),
  ('la', 'The Virgil SL', 'bar'),
  ('la', 'The Well Hollywood Bar', 'bar'),
  ('la', 'The Wolves Downtown', 'bar'),
  ('la', 'Thirsty Crow SL', 'bar'),
  ('la', 'Three Clubs Hollywood', 'bar'),
  ('la', 'Thunderbolt', 'bar'),
  ('la', 'Tiki-Ti Los Feliz', 'bar'),
  ('la', 'Townhouse Del Monte', 'bar'),
  ('la', 'Venice Beach Bar & Kitchen', 'bar'),
  ('la', 'Venice Beach Club', 'bar'),
  ('la', 'Walker Inn MW', 'bar'),
  ('la', 'Warwick', 'club'),
  ('la', 'Ye Rustic Inn LF', 'bar'),
  ('la', 'Zouk LA', 'club'),
  ('nyc', '13th Step EV', 'bar'),
  ('nyc', '169 Bar LES', 'bar'),
  ('nyc', '3 Dollar Bill', 'club'),
  ('nyc', '61 Local CG', 'bar'),
  ('nyc', 'Achilles Heel GP', 'bar'),
  ('nyc', 'ACME', 'club'),
  ('nyc', 'Amor y Amargo', 'bar'),
  ('nyc', 'Angel''s Share EV', 'bar'),
  ('nyc', 'Animal', 'club'),
  ('nyc', 'Arthur''s Tavern', 'bar'),
  ('nyc', 'Attaboy', 'bar'),
  ('nyc', 'Bar Chimera', 'bar'),
  ('nyc', 'Bar Etienne', 'bar'),
  ('nyc', 'Bar Goto LES', 'bar'),
  ('nyc', 'Bar Great Harry', 'bar'),
  ('nyc', 'Bar Kabawa', 'bar'),
  ('nyc', 'Bar Nana FiDi', 'bar'),
  ('nyc', 'Bar Snack', 'bar'),
  ('nyc', 'Barcade WB', 'bar'),
  ('nyc', 'Barracuda Chelsea', 'bar'),
  ('nyc', 'Bartini Chelsea', 'bar'),
  ('nyc', 'Basement', 'club'),
  ('nyc', 'Bathtub Gin Chelsea', 'bar'),
  ('nyc', 'Bemelmans Bar', 'bar'),
  ('nyc', 'Bernie & Herb''s', 'bar'),
  ('nyc', 'Berry Park WB', 'bar'),
  ('nyc', 'Biddy''s Pub', 'bar'),
  ('nyc', 'Birdy''s BW', 'bar'),
  ('nyc', 'Black Flamingo WB', 'club'),
  ('nyc', 'Blind Tiger WV', 'bar'),
  ('nyc', 'Boss Tweeds', 'bar'),
  ('nyc', 'Bossa Nova Civic', 'bar'),
  ('nyc', 'Bossa Nova Civic Club', 'club'),
  ('nyc', 'Brandy Library', 'bar'),
  ('nyc', 'Brass Monkey NYC', 'bar'),
  ('nyc', 'Brooklyn Social CG', 'bar'),
  ('nyc', 'Buttermilk Bar', 'bar'),
  ('nyc', 'C''mon Everybody', 'club'),
  ('nyc', 'Campbell NYC', 'bar'),
  ('nyc', 'Cienfuegos EV', 'bar'),
  ('nyc', 'Clandestino LES', 'bar'),
  ('nyc', 'Clinton Hall FiDi', 'bar'),
  ('nyc', 'Clover Club CG', 'bar'),
  ('nyc', 'Club Cumming', 'club'),
  ('nyc', 'Cobra Club BW', 'bar'),
  ('nyc', 'Connolly''s NYC', 'bar'),
  ('nyc', 'Corkbuzz SoHo', 'bar'),
  ('nyc', 'Cubbyhole', 'bar'),
  ('nyc', 'Cubbyhole WV', 'bar'),
  ('nyc', 'Dante', 'bar'),
  ('nyc', 'Dante WV', 'bar'),
  ('nyc', 'Dear Irving NYC', 'bar'),
  ('nyc', 'Death and Co EV', 'bar'),
  ('nyc', 'Desert 5 Spot', 'bar'),
  ('nyc', 'Diamond GP', 'bar'),
  ('nyc', 'Dokidoki', 'bar'),
  ('nyc', 'Don''t Tell Mama', 'bar'),
  ('nyc', 'Double Chicken Please', 'bar'),
  ('nyc', 'Dromedary BW', 'bar'),
  ('nyc', 'Elsewhere', 'club'),
  ('nyc', 'Employees Only WV', 'bar'),
  ('nyc', 'Evil Twin RW', 'bar'),
  ('nyc', 'Fanelli Cafe SoHo', 'bar'),
  ('nyc', 'Floyd CG', 'bar'),
  ('nyc', 'Fraunces Tavern FiDi', 'bar'),
  ('nyc', 'Friends and Lovers', 'bar'),
  ('nyc', 'G Lounge Chelsea', 'bar'),
  ('nyc', 'Gabriela', 'club'),
  ('nyc', 'Galway Hooker NYC', 'bar'),
  ('nyc', 'Gaslight NYC', 'bar'),
  ('nyc', 'Golden Ratio', 'bar'),
  ('nyc', 'Good Room', 'club'),
  ('nyc', 'Gospel', 'club'),
  ('nyc', 'Gottscheer Hall', 'bar'),
  ('nyc', 'Gowanus Yacht Club', 'bar'),
  ('nyc', 'Grand Army', 'bar'),
  ('nyc', 'Gym Sportsbar Chelsea', 'bar'),
  ('nyc', 'Harlem Hops', 'bar'),
  ('nyc', 'Heavy Woods BW', 'bar'),
  ('nyc', 'Henrietta Hudson', 'bar'),
  ('nyc', 'Hideaway FiDi', 'bar'),
  ('nyc', 'High Line Hotel Bar', 'bar'),
  ('nyc', 'Hogs and Heifers', 'bar'),
  ('nyc', 'Holiday Cocktail EV', 'bar'),
  ('nyc', 'Hotel Delmano WB', 'bar'),
  ('nyc', 'House of Yes', 'club'),
  ('nyc', 'Immigrant EV', 'bar'),
  ('nyc', 'Jeremy''s Ale House', 'bar'),
  ('nyc', 'Jimmy''s Corner NYC', 'bar'),
  ('nyc', 'Jupiter Disco', 'club'),
  ('nyc', 'KABIN', 'bar'),
  ('nyc', 'Katana Kitten', 'bar'),
  ('nyc', 'Keep Ridgewood', 'bar'),
  ('nyc', 'Keepers', 'bar'),
  ('nyc', 'Lavender Lake CG', 'bar'),
  ('nyc', 'LAVO NYC', 'club'),
  ('nyc', 'Le Bain', 'club'),
  ('nyc', 'Leadbelly LES', 'bar'),
  ('nyc', 'Leyenda CG', 'bar'),
  ('nyc', 'Libation LES', 'bar'),
  ('nyc', 'Little Branch WV', 'bar'),
  ('nyc', 'Living Room at W', 'bar'),
  ('nyc', 'Long Island Bar CG', 'bar'),
  ('nyc', 'Lot 45 BW', 'bar'),
  ('nyc', 'Mace EV', 'bar'),
  ('nyc', 'Maison Premiere WB', 'bar'),
  ('nyc', 'Marie''s Crisis WV', 'bar'),
  ('nyc', 'Marquee NYC', 'club'),
  ('nyc', 'Matches', 'bar'),
  ('nyc', 'Max Fish LES', 'bar'),
  ('nyc', 'McHales NYC', 'bar'),
  ('nyc', 'McSorley''s Old Ale', 'bar'),
  ('nyc', 'Milo''s Yard RW', 'bar'),
  ('nyc', 'Mission Dolores CG', 'bar'),
  ('nyc', 'Monk McGinns', 'bar'),
  ('nyc', 'Mood Ring BW', 'bar'),
  ('nyc', 'Narrows BW', 'bar'),
  ('nyc', 'Night of Joy WB', 'bar'),
  ('nyc', 'Nitecap LES', 'bar'),
  ('nyc', 'NoMad Bar NYC', 'bar'),
  ('nyc', 'Northern Territory GP', 'bar'),
  ('nyc', 'Nothing Really Matters', 'bar'),
  ('nyc', 'Nowadays', 'club'),
  ('nyc', 'O''Hara''s FiDi', 'bar'),
  ('nyc', 'O''Lunney''s NYC', 'bar'),
  ('nyc', 'Oddball', 'bar'),
  ('nyc', 'Old Town Bar NYC', 'bar'),
  ('nyc', 'Only Child', 'bar'),
  ('nyc', 'Other Half Brewing', 'bar'),
  ('nyc', 'Otto''s Shrunken Head', 'bar'),
  ('nyc', 'Output WB', 'club'),
  ('nyc', 'Paragon', 'club'),
  ('nyc', 'Paramount Bar NYC', 'bar'),
  ('nyc', 'Pearl''s Social Club', 'bar'),
  ('nyc', 'Peek Inn', 'bar'),
  ('nyc', 'Pegu Club SoHo', 'bar'),
  ('nyc', 'People''s', 'bar'),
  ('nyc', 'Pete''s Candy Store', 'bar'),
  ('nyc', 'Pete''s Tavern NYC', 'bar'),
  ('nyc', 'Pianos LES', 'bar'),
  ('nyc', 'Pine Box Rock Shop', 'bar'),
  ('nyc', 'Pocket Bar NYC', 'bar'),
  ('nyc', 'Pony''s', 'bar'),
  ('nyc', 'Porchlight Chelsea', 'bar'),
  ('nyc', 'Pouring Ribbons LES', 'bar'),
  ('nyc', 'Provocateur NYC', 'club'),
  ('nyc', 'Public Records', 'club'),
  ('nyc', 'Raines Law Room NYC', 'bar'),
  ('nyc', 'Ramona GP', 'bar'),
  ('nyc', 'Red Bar Chelsea', 'bar'),
  ('nyc', 'Royal Palms CG', 'bar'),
  ('nyc', 'Rue B EV', 'bar'),
  ('nyc', 'Rum House NYC', 'bar'),
  ('nyc', 'Russian Vodka Room', 'bar'),
  ('nyc', 'Saturn Bar RW', 'bar'),
  ('nyc', 'Sauced', 'bar'),
  ('nyc', 'Schmuck', 'bar'),
  ('nyc', 'Seed Library', 'bar'),
  ('nyc', 'Shania''s Max Bet', 'bar'),
  ('nyc', 'Sip & Guzzle', 'bar'),
  ('nyc', 'Spring Lounge SoHo', 'bar'),
  ('nyc', 'Spritzenhaus GP', 'bar'),
  ('nyc', 'Standard Biergarten', 'bar'),
  ('nyc', 'Standings EV', 'bar'),
  ('nyc', 'Stone Street Tavern', 'bar'),
  ('nyc', 'Stonewall Inn', 'bar'),
  ('nyc', 'Strong Rope CG', 'bar'),
  ('nyc', 'Sunken Harbor Club', 'bar'),
  ('nyc', 'Sunshine Laundromat', 'bar'),
  ('nyc', 'Superbueno', 'bar'),
  ('nyc', 'Sweet Afton', 'bar'),
  ('nyc', 'The Auction House', 'bar'),
  ('nyc', 'The Bar at Quarters', 'bar'),
  ('nyc', 'The Blond SoHo', 'bar'),
  ('nyc', 'The Box', 'club'),
  ('nyc', 'The Duplex WV', 'bar'),
  ('nyc', 'The Eagle Chelsea', 'bar'),
  ('nyc', 'The Ear Inn SoHo', 'bar'),
  ('nyc', 'The Gutter WB', 'bar'),
  ('nyc', 'The Johnson''s BW', 'bar'),
  ('nyc', 'The Keep BW', 'bar'),
  ('nyc', 'The Mark Bar', 'bar'),
  ('nyc', 'The Monster WV', 'club'),
  ('nyc', 'The Portrait Bar', 'bar'),
  ('nyc', 'The Shanty WB', 'bar'),
  ('nyc', 'The Tippler Chelsea', 'bar'),
  ('nyc', 'The Wayland EV', 'bar'),
  ('nyc', 'Threes Gowanus', 'bar'),
  ('nyc', 'Tigre', 'bar'),
  ('nyc', 'Tin''s', 'bar'),
  ('nyc', 'Torst GP', 'bar'),
  ('nyc', 'Treadwell Park', 'bar'),
  ('nyc', 'Ulysses FiDi', 'bar'),
  ('nyc', 'Undercurrent', 'bar'),
  ('nyc', 'Union Pool WB', 'bar'),
  ('nyc', 'Up and Down NYC', 'club'),
  ('nyc', 'Up and Up EV', 'bar'),
  ('nyc', 'Verlaine LES', 'bar'),
  ('nyc', 'Vintry FiDi', 'bar'),
  ('nyc', 'Welcome to Johnsons', 'bar'),
  ('nyc', 'White Horse Tavern', 'bar'),
  ('nyc', 'Wilfie and Nell', 'bar'),
  ('nyc', 'Windjammer RW', 'bar'),
  ('nyc', 'Zombie Hut CG', 'bar'),
  ('nyc', 'Zum Schneider EV', 'bar')
) as a(city, name, category)
where v.city=a.city and v.name=a.name and not coalesce(v.is_demo,false);

update public.venues
set leaderboard_exclusion_reason = 'not_a_bar_or_nightclub'
where not leaderboard_eligible and not coalesce(is_demo,false);

update public.venues v set leaderboard_exclusion_reason = a.reason
from (values
  ('la', '1720', 'concert_or_performance_venue'),
  ('la', 'Alcove Los Feliz', 'restaurant_led'),
  ('la', 'All Time Los Feliz', 'restaurant_led'),
  ('la', 'AOC Mid-Wilshire', 'restaurant_led'),
  ('la', 'Arthur J MB', 'restaurant_led'),
  ('la', 'Atrium Los Feliz', 'restaurant_led'),
  ('la', 'Avenue 50 HP', 'not_a_bar_or_nightclub'),
  ('la', 'Baldoria MW', 'restaurant_led'),
  ('la', 'Bavel Arts District', 'restaurant_led'),
  ('la', 'Canal Club Venice', 'restaurant_led'),
  ('la', 'Cassell''s MW', 'restaurant_led'),
  ('la', 'Checker Hall HP', 'needs_category_review'),
  ('la', 'Chez Jay SM', 'needs_category_review'),
  ('la', 'Chi Spacca MW', 'restaurant_led'),
  ('la', 'Cliff''s Edge Los Feliz', 'restaurant_led'),
  ('la', 'Cliff''s Edge Silver Lake', 'restaurant_led'),
  ('la', 'Cookbook Echo Park', 'not_a_bar_or_nightclub'),
  ('la', 'Dan Sung Sa Ktown', 'needs_category_review'),
  ('la', 'Dante Beverly Hills', 'restaurant_led'),
  ('la', 'Delilah WeHo', 'restaurant_led'),
  ('la', 'Dino''s Chicken Ktown', 'restaurant_led'),
  ('la', 'Dresden Los Feliz', 'restaurant_led'),
  ('la', 'Dudley Market', 'restaurant_led'),
  ('la', 'Edendale SL', 'restaurant_led'),
  ('la', 'El Cid Silver Lake', 'concert_or_performance_venue'),
  ('la', 'El Sombrero MB', 'restaurant_led'),
  ('la', 'Elf Cafe EP', 'restaurant_led'),
  ('la', 'Escala Koreatown', 'restaurant_led'),
  ('la', 'ETA Highland Park', 'needs_category_review'),
  ('la', 'Fern Dell LF', 'not_a_bar_or_nightclub'),
  ('la', 'Figaro Los Feliz', 'restaurant_led'),
  ('la', 'Fishing Dynamite MB', 'restaurant_led'),
  ('la', 'Formosa Cafe Hollywood', 'restaurant_led'),
  ('la', 'Fred 62 Los Feliz', 'restaurant_led'),
  ('la', 'Genwa Ktown', 'restaurant_led'),
  ('la', 'Gjelina Venice', 'restaurant_led'),
  ('la', 'Gorbals MW', 'restaurant_led'),
  ('la', 'Harvelle''s Blues', 'concert_or_performance_venue'),
  ('la', 'Here''s Looking MW', 'restaurant_led'),
  ('la', 'Hi Hat HP', 'concert_or_performance_venue'),
  ('la', 'Homestate Los Feliz', 'restaurant_led'),
  ('la', 'Houston''s Manhattan Beach', 'restaurant_led'),
  ('la', 'Huaraches HP', 'restaurant_led'),
  ('la', 'Hyperion Public SL', 'restaurant_led'),
  ('la', 'Independence SM', 'restaurant_led'),
  ('la', 'James Beach Venice', 'restaurant_led'),
  ('la', 'Jeni''s Los Feliz', 'not_a_bar_or_nightclub'),
  ('la', 'Johnny''s HP', 'restaurant_led'),
  ('la', 'Joy Highland Park', 'restaurant_led'),
  ('la', 'Ka''Teen Ktown', 'restaurant_led'),
  ('la', 'Kettle MB', 'restaurant_led'),
  ('la', 'Kismet Los Feliz', 'restaurant_led'),
  ('la', 'L and E Oyster Bar', 'restaurant_led'),
  ('la', 'Lady Byrd EP', 'restaurant_led'),
  ('la', 'Larry''s Venice Beach', 'restaurant_led'),
  ('la', 'Lassen''s Echo Park', 'not_a_bar_or_nightclub'),
  ('la', 'Level 8', 'needs_category_review'),
  ('la', 'Little Dom''s LF', 'restaurant_led'),
  ('la', 'Local Yolk MB', 'restaurant_led'),
  ('la', 'Love Salt MB', 'restaurant_led'),
  ('la', 'Masa of EP', 'restaurant_led'),
  ('la', 'MB Country Club', 'not_a_bar_or_nightclub'),
  ('la', 'MB Post Bar', 'restaurant_led'),
  ('la', 'Messhall LF', 'restaurant_led'),
  ('la', 'Mohawk Bend Echo Park', 'restaurant_led'),
  ('la', 'Mozza Osteria MW', 'restaurant_led'),
  ('la', 'Mozza Pizzeria MW', 'restaurant_led'),
  ('la', 'Musso and Frank Hollywood', 'restaurant_led'),
  ('la', 'Nice Guy WeHo', 'restaurant_led'),
  ('la', 'Pancho''s Manhattan Beach', 'restaurant_led'),
  ('la', 'Petty Cash MW', 'restaurant_led'),
  ('la', 'Pierre MB', 'needs_category_review'),
  ('la', 'Polka HP', 'restaurant_led'),
  ('la', 'Pot Koreatown', 'restaurant_led'),
  ('la', 'Proof LF', 'not_a_bar_or_nightclub'),
  ('la', 'Quarters Ktown', 'restaurant_led'),
  ('la', 'Ray''s Mid-Wilshire', 'restaurant_led'),
  ('la', 'Redbird DTLA', 'restaurant_led'),
  ('la', 'Republique Mid-Wilshire', 'restaurant_led'),
  ('la', 'Rock n Fish MB', 'restaurant_led'),
  ('la', 'Rockwell LF', 'concert_or_performance_venue'),
  ('la', 'Rosen Ktown', 'needs_category_review'),
  ('la', 'Sage Bistro EP', 'restaurant_led'),
  ('la', 'Scopa Italian Venice', 'restaurant_led'),
  ('la', 'Silverlake Lounge Bar', 'concert_or_performance_venue'),
  ('la', 'Silverlake Wine Bar', 'not_a_bar_or_nightclub'),
  ('la', 'Sixth MW', 'needs_category_review'),
  ('la', 'Soban Ktown', 'restaurant_led'),
  ('la', 'Stories Echo Park', 'not_a_bar_or_nightclub'),
  ('la', 'Sycamore Silver Lake', 'needs_category_review'),
  ('la', 'Taix French Restaurant', 'restaurant_led'),
  ('la', 'Tasting Kitchen Venice', 'restaurant_led'),
  ('la', 'Tesse WeHo', 'restaurant_led'),
  ('la', 'The Albright SM', 'restaurant_led'),
  ('la', 'The Lounge Culver City', 'needs_category_review'),
  ('la', 'The Misfit SM', 'restaurant_led'),
  ('la', 'The Prince Ktown', 'restaurant_led'),
  ('la', 'The Wilton Ktown', 'needs_category_review'),
  ('la', 'Town Pizza HP', 'restaurant_led'),
  ('la', 'Triple Beam HP', 'restaurant_led'),
  ('la', 'Troubadour WeHo', 'concert_or_performance_venue'),
  ('la', 'Uncle Bill''s MB', 'restaurant_led'),
  ('la', 'Venice Whaler', 'restaurant_led'),
  ('la', 'Vermont Los Feliz', 'needs_category_review'),
  ('la', 'Waterfront Venice', 'restaurant_led'),
  ('la', 'Whisky a Go Go WeHo', 'concert_or_performance_venue'),
  ('la', 'Winsome EP', 'restaurant_led'),
  ('la', 'Wokcano Santa Monica', 'restaurant_led'),
  ('la', 'Wurstkuche Venice', 'restaurant_led'),
  ('la', 'Zaytinya', 'restaurant_led'),
  ('la', 'Zinc Shade Hotel', 'restaurant_led'),
  ('nyc', '11 Madison Park Bar', 'restaurant_led'),
  ('nyc', '55 Bar WV', 'concert_or_performance_venue'),
  ('nyc', 'ABC Kitchen Bar', 'restaurant_led'),
  ('nyc', 'Anella GP', 'restaurant_led'),
  ('nyc', 'Aquagrill SoHo', 'restaurant_led'),
  ('nyc', 'Archie''s RW', 'restaurant_led'),
  ('nyc', 'Aria Wine WV', 'restaurant_led'),
  ('nyc', 'Arlene''s Grocery', 'concert_or_performance_venue'),
  ('nyc', 'Baby''s All Right', 'concert_or_performance_venue'),
  ('nyc', 'Bagatelle NYC', 'restaurant_led'),
  ('nyc', 'Balthazar SoHo', 'restaurant_led'),
  ('nyc', 'Bar Bruno CG', 'restaurant_led'),
  ('nyc', 'Bar Pitti SoHo', 'restaurant_led'),
  ('nyc', 'Beauty Essex LES', 'restaurant_led'),
  ('nyc', 'Bell House CG', 'concert_or_performance_venue'),
  ('nyc', 'Bernie''s RW', 'restaurant_led'),
  ('nyc', 'Bill''s Bar Burger', 'restaurant_led'),
  ('nyc', 'Bin No. 220 FiDi', 'needs_category_review'),
  ('nyc', 'Birdland NYC', 'concert_or_performance_venue'),
  ('nyc', 'Blue Note WV', 'concert_or_performance_venue'),
  ('nyc', 'Blue Ribbon Sushi', 'restaurant_led'),
  ('nyc', 'Brasserie Cognac', 'restaurant_led'),
  ('nyc', 'Brooklyn Bowl WB', 'concert_or_performance_venue'),
  ('nyc', 'Buddakan NYC', 'restaurant_led'),
  ('nyc', 'Café Carlyle', 'concert_or_performance_venue'),
  ('nyc', 'Cafe Ghia RW', 'restaurant_led'),
  ('nyc', 'Carmen Myrtle RW', 'needs_category_review'),
  ('nyc', 'Chelsea Music Hall', 'concert_or_performance_venue'),
  ('nyc', 'Chumley''s WV', 'restaurant_led'),
  ('nyc', 'Cipriani SoHo', 'restaurant_led'),
  ('nyc', 'Cipriani Wall St', 'restaurant_led'),
  ('nyc', 'Diner WB', 'restaurant_led'),
  ('nyc', 'Ed''s Lobster SoHo', 'restaurant_led'),
  ('nyc', 'El Luchador FiDi', 'restaurant_led'),
  ('nyc', 'Elmo Chelsea', 'restaurant_led'),
  ('nyc', 'Esme GP', 'restaurant_led'),
  ('nyc', 'Extra Fancy WB', 'restaurant_led'),
  ('nyc', 'Fig Olive NYC', 'restaurant_led'),
  ('nyc', 'Five Leaves GP', 'restaurant_led'),
  ('nyc', 'Flatiron Room NYC', 'needs_category_review'),
  ('nyc', 'Footlight RW', 'concert_or_performance_venue'),
  ('nyc', 'Freehold RW', 'needs_category_review'),
  ('nyc', 'Glasserie GP', 'restaurant_led'),
  ('nyc', 'Gramercy Tavern Bar', 'restaurant_led'),
  ('nyc', 'Habitat GP', 'restaurant_led'),
  ('nyc', 'Hillstone NYC', 'restaurant_led'),
  ('nyc', 'Houdini Kitchen RW', 'restaurant_led'),
  ('nyc', 'Ilili NYC', 'restaurant_led'),
  ('nyc', 'Iridium NYC', 'concert_or_performance_venue'),
  ('nyc', 'Irving Farm NYC', 'not_a_bar_or_nightclub'),
  ('nyc', 'Joe''s Pub EV', 'concert_or_performance_venue'),
  ('nyc', 'Julia''s RW', 'restaurant_led'),
  ('nyc', 'Katz''s Bar', 'restaurant_led'),
  ('nyc', 'KickShaw GP', 'restaurant_led'),
  ('nyc', 'La Esquina SoHo', 'restaurant_led'),
  ('nyc', 'Le Coucou SoHo', 'restaurant_led'),
  ('nyc', 'Le Crocodile GP', 'restaurant_led'),
  ('nyc', 'Littlefield CG', 'concert_or_performance_venue'),
  ('nyc', 'Lucky Strike SoHo', 'restaurant_led'),
  ('nyc', 'Lure Fishbar SoHo', 'restaurant_led'),
  ('nyc', 'Mad Dog Beans', 'restaurant_led'),
  ('nyc', 'Maialino NYC', 'restaurant_led'),
  ('nyc', 'McKittrick Hotel', 'needs_category_review'),
  ('nyc', 'Mercer Kitchen', 'restaurant_led'),
  ('nyc', 'Mercury Lounge LES', 'concert_or_performance_venue'),
  ('nyc', 'Nublu EV', 'concert_or_performance_venue'),
  ('nyc', 'Palace Cafe GP', 'needs_category_review'),
  ('nyc', 'Pastis Meatpacking', 'restaurant_led'),
  ('nyc', 'Paulie Gee''s GP', 'restaurant_led'),
  ('nyc', 'Pier A Harbor House', 'needs_category_review'),
  ('nyc', 'Porterhouse FiDi', 'restaurant_led'),
  ('nyc', 'Raoul''s SoHo', 'restaurant_led'),
  ('nyc', 'Rocking Horse Chelsea', 'restaurant_led'),
  ('nyc', 'Rockwood Music Hall', 'concert_or_performance_venue'),
  ('nyc', 'Rookery BW', 'restaurant_led'),
  ('nyc', 'Rough Trade WB', 'concert_or_performance_venue'),
  ('nyc', 'Sadelle''s SoHo', 'restaurant_led'),
  ('nyc', 'Sally Roots BW', 'restaurant_led'),
  ('nyc', 'SD26 NYC', 'restaurant_led'),
  ('nyc', 'Signals RW', 'needs_category_review'),
  ('nyc', 'Smalls Jazz WV', 'concert_or_performance_venue'),
  ('nyc', 'Spice Market NYC', 'restaurant_led'),
  ('nyc', 'Spike Hill WB', 'needs_category_review'),
  ('nyc', 'Spotted Pig WV', 'restaurant_led'),
  ('nyc', 'STK Meatpacking', 'restaurant_led'),
  ('nyc', 'Swing 46 NYC', 'restaurant_led'),
  ('nyc', 'Tamarind NYC', 'restaurant_led'),
  ('nyc', 'Tao Downtown NYC', 'needs_category_review'),
  ('nyc', 'The Chester NYC', 'restaurant_led'),
  ('nyc', 'The Django SoHo', 'concert_or_performance_venue'),
  ('nyc', 'The Fulton FiDi', 'restaurant_led'),
  ('nyc', 'The Park Chelsea', 'restaurant_led'),
  ('nyc', 'The Rink RW', 'needs_category_review'),
  ('nyc', 'The Sultan Room', 'concert_or_performance_venue'),
  ('nyc', 'Topos Bookstore RW', 'not_a_bar_or_nightclub'),
  ('nyc', 'Tortilla Flats WV', 'restaurant_led'),
  ('nyc', 'Trans-Pecos RW', 'concert_or_performance_venue'),
  ('nyc', 'TV Eye RW', 'concert_or_performance_venue'),
  ('nyc', 'Village Vanguard', 'concert_or_performance_venue'),
  ('nyc', 'Wall Street Bath', 'not_a_bar_or_nightclub'),
  ('nyc', 'Warsaw GP', 'concert_or_performance_venue'),
  ('nyc', 'Word GP', 'not_a_bar_or_nightclub')
) as a(city,name,reason)
where v.city=a.city and v.name=a.name and not coalesce(v.is_demo,false);

create or replace function internal.enforce_leaderboard_eligibility()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  if not coalesce(new.is_demo,false) and not (
    coalesce(new.leaderboard_category in ('bar','club'),false)
    and coalesce(new.type in ('bar','cocktail_bar','club','nightclub'),false)
  ) then
    new.popularity_rank := null;
    new.is_leaderboard_promoted := false;
    new.leaderboard_promo_order := null;
  end if;
  return new;
end;
$function$;

create trigger enforce_leaderboard_eligibility
before insert or update of leaderboard_category, type, is_demo, popularity_rank,
  is_leaderboard_promoted, leaderboard_promo_order
on public.venues for each row execute function internal.enforce_leaderboard_eligibility();

CREATE OR REPLACE FUNCTION internal.recompute_venue_leaderboard(p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- Remove only derived leaderboard scores; retain venues and source history.
  delete from public.venue_leaderboard_scores s
  using public.venues v
  where s.venue_id = v.id
    and not coalesce(v.is_demo,false)
    and not v.leaderboard_eligible
    and (p_city is null or v.city = p_city);

  with eligible as (
    select
      v.id as venue_id,
      v.city,
      v.type as venue_type,
      v.google_rating::numeric as google_rating,
      coalesce(v.google_user_ratings_total, 0) as google_reviews
    from public.venues v
    where coalesce(v.is_demo, false) = false
      and v.leaderboard_eligible
      and v.city is not null
      and (p_city is null or v.city = p_city)
  ),
  active_signals as (
    select
      s.venue_id,
      s.source,
      coalesce(nullif(s.signal_kind,''),'mention') as signal_kind,
      s.score::numeric as score,
      s.weight::numeric as base_weight,
      s.mention_count,
      s.observed_at,
      coalesce(
        nullif(regexp_replace(lower(coalesce(s.source_url,'')), '^https?://(www\.)?([^/]+).*$','\2'), ''),
        s.source
      ) as publisher,
      case
        when s.source = 'x' then 3.0
        when s.source = 'reddit' then 10.0
        when s.signal_kind = 'event_demand' then 7.0
        when s.signal_kind = 'social_buzz' then 5.0
        when s.signal_kind = 'community_buzz' then 10.0
        when s.signal_kind = 'nightlife_index' then 45.0
        when s.signal_kind = 'bar_editorial' then 30.0
        when s.source = 'editorial' then 21.0
        when s.source = 'manual' then 45.0
        else 14.0
      end as half_life_days,
      case
        when s.signal_kind = 'nightlife_index' then 1.55
        when s.signal_kind = 'event_demand' then 1.35
        when s.signal_kind = 'social_buzz' then 1.35
        when s.signal_kind = 'community_buzz' then 1.20
        when s.signal_kind = 'bar_editorial' then 0.45
        when s.signal_kind = 'curated_list' then 0.65
        when s.signal_kind = 'mention' then 0.55
        else 0.75
      end as kind_multiplier,
      case
        when s.source = 'x' then 1.15
        when s.source = 'reddit' then 1.05
        else 1.0
      end as source_multiplier
    from public.venue_signal_events s
    join eligible e on e.venue_id = s.venue_id
    where (s.expires_at is null or s.expires_at > now())
      and s.observed_at <= now()
  ),
  decayed as (
    select
      venue_id,
      source,
      signal_kind,
      publisher,
      score,
      mention_count,
      base_weight * kind_multiplier * source_multiplier * exp(
        -ln(2::numeric) * greatest(extract(epoch from (now() - observed_at)) / 86400.0, 0) / half_life_days
      ) as effective_weight
    from active_signals
  ),
  per_publisher as (
    select
      venue_id,
      publisher,
      sum(score * effective_weight) / nullif(sum(effective_weight), 0) as publisher_score,
      least(2.0::numeric, sum(effective_weight)) as publisher_weight,
      sum(mention_count)::integer as mentions,
      array_agg(distinct signal_kind) as signal_kinds,
      max(case when signal_kind in ('nightlife_index','event_demand','social_buzz','community_buzz') then 1 else 0 end)::integer as nightlife_relevant
    from decayed
    where effective_weight > 0.001
    group by venue_id, publisher
  ),
  buzz as (
    select
      venue_id,
      sum(publisher_score * publisher_weight) / nullif(sum(publisher_weight), 0) as raw_buzz_score,
      least(1.0::numeric, sum(publisher_weight) / 3.0) as internet_confidence,
      count(*)::integer as source_count,
      sum(nightlife_relevant)::integer as nightlife_source_count,
      jsonb_object_agg(
        publisher,
        jsonb_build_object(
          'score', round(publisher_score::numeric, 1),
          'weight', round(publisher_weight::numeric, 2),
          'mentions', mentions,
          'kinds', signal_kinds
        )
      ) as source_breakdown
    from per_publisher
    group by venue_id
  ),
  google_quality as (
    select
      e.*,
      case
        when e.google_rating is null then 50.0
        else least(
          65.0,
          greatest(
            40.0,
            50.0
              + ((e.google_rating - 4.0) * 10.0)
              + least(5.0, ln(1.0 + greatest(e.google_reviews, 0)))
          )
        )
      end as google_quality_score
    from eligible e
  ),
  internet as (
    select
      g.venue_id,
      g.city,
      g.venue_type,
      g.google_quality_score,
      coalesce(b.internet_confidence, 0.0) as internet_confidence,
      coalesce(b.source_count, 0) as source_count,
      coalesce(b.nightlife_source_count, 0) as nightlife_source_count,
      coalesce(b.source_breakdown, '{}'::jsonb) || jsonb_build_object(
        'google', jsonb_build_object(
          'score', round(g.google_quality_score::numeric, 1),
          'rating', g.google_rating,
          'reviews', g.google_reviews
        )
      ) as source_breakdown,
      case
        when b.raw_buzz_score is null then
          50.0 + 0.05 * (g.google_quality_score - 50.0)
        else
          0.95 * (50.0 + b.internet_confidence * (b.raw_buzz_score - 50.0))
          + 0.05 * g.google_quality_score
      end as internet_score
    from google_quality g
    left join buzz b on b.venue_id = g.venue_id
  ),
  checkin_counts as (
    select
      e.venue_id,
      count(distinct c.user_id) filter (
        where c.created_at >= now() - interval '24 hours'
      )::integer as unique_24h,
      count(distinct c.user_id) filter (
        where c.created_at >= now() - interval '7 days'
      )::integer as unique_7d
    from eligible e
    left join public.checkins c
      on c.venue_id = e.venue_id
      and coalesce(c.is_demo, false) = false
      and c.created_at >= now() - interval '7 days'
    group by e.venue_id
  ),
  checkin_rank as (
    select
      venue_id,
      unique_24h,
      unique_7d,
      percent_rank() over (
        order by ((unique_24h * 3) + unique_7d)
      ) as activity_percentile
    from checkin_counts
  ),
  checkin_scored as (
    select
      venue_id,
      unique_24h,
      unique_7d,
      50.0 +
        (unique_7d::numeric / (unique_7d + 8.0)) *
        ((activity_percentile * 100.0) - 50.0) as checkin_score
    from checkin_rank
  ),
  computed as (
    select
      i.venue_id,
      i.city,
      least(100.0, greatest(0.0, i.internet_score)) as internet_score,
      least(100.0, greatest(0.0, c.checkin_score)) as checkin_score,
      least(
        100.0,
        greatest(
          0.0,
          0.75 * least(100.0, greatest(0.0, i.internet_score))
          + 0.25 * least(100.0, greatest(0.0, c.checkin_score))
        )
      ) as final_score,
      i.internet_confidence,
      c.unique_24h,
      c.unique_7d,
      i.source_count,
      i.source_breakdown,
      case
        when c.unique_24h >= 3 and c.checkin_score >= 70 then 'Trending tonight'
        when i.internet_score >= 78 and i.nightlife_source_count >= 2 then 'Hot right now'
        when c.unique_7d >= 3 then 'Popular on Spotted'
        when i.internet_score >= 72 and i.nightlife_source_count >= 1 then 'On the radar'
        else null
      end as trend_label
    from internet i
    join checkin_scored c on c.venue_id = i.venue_id
  )
  insert into public.venue_leaderboard_scores (
    venue_id,
    city,
    internet_score,
    checkin_score,
    final_score,
    internet_confidence,
    unique_checkins_24h,
    unique_checkins_7d,
    source_count,
    source_breakdown,
    trend_label,
    computed_at
  )
  select
    venue_id,
    city,
    round(internet_score::numeric, 2),
    round(checkin_score::numeric, 2),
    round(final_score::numeric, 2),
    round(internet_confidence::numeric, 4),
    unique_24h,
    unique_7d,
    source_count,
    source_breakdown,
    trend_label,
    now()
  from computed
  on conflict (venue_id) do update set
    city = excluded.city,
    internet_score = excluded.internet_score,
    checkin_score = excluded.checkin_score,
    final_score = excluded.final_score,
    internet_confidence = excluded.internet_confidence,
    unique_checkins_24h = excluded.unique_checkins_24h,
    unique_checkins_7d = excluded.unique_checkins_7d,
    source_count = excluded.source_count,
    source_breakdown = excluded.source_breakdown,
    trend_label = excluded.trend_label,
    computed_at = excluded.computed_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_venue_leaderboard(p_city text DEFAULT 'nyc'::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(venue_id uuid, name text, neighborhood text, venue_type text, lat double precision, lng double precision, google_rating numeric, google_user_ratings_total integer, internet_score numeric, checkin_score numeric, final_score numeric, unique_checkins_24h integer, unique_checkins_7d integer, trend_label text, source_count integer, computed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    v.id,
    v.name,
    v.neighborhood,
    v.type,
    v.lat,
    v.lng,
    v.google_rating,
    v.google_user_ratings_total,
    s.internet_score,
    s.checkin_score,
    s.final_score,
    s.unique_checkins_24h,
    s.unique_checkins_7d,
    s.trend_label,
    s.source_count,
    s.computed_at
  from public.venue_leaderboard_scores s
  join public.venues v on v.id = s.venue_id
  where s.city = p_city
    and coalesce(v.is_demo, false) = false
    and v.leaderboard_eligible
    and (
      v.type in ('club','nightclub')
      or s.unique_checkins_7d > 0
      or exists (
        select 1
        from public.venue_signal_events vse
        where vse.venue_id = v.id
          and (vse.expires_at is null or vse.expires_at > now())
          and vse.observed_at <= now()
          and vse.observed_at >= now() - interval '60 days'
          and vse.signal_kind in ('nightlife_index','event_demand','social_buzz','community_buzz')
      )
    )
  order by s.final_score desc, s.internet_score desc, v.name asc
  limit greatest(1, least(p_limit, 100));
$function$;

CREATE OR REPLACE FUNCTION internal.sync_venue_popularity_rank(p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- Reset eligible venues in scope so stale manual ranks do not persist.
  update public.venues
  set popularity_rank = case when leaderboard_eligible then 999 else null end,
      is_leaderboard_promoted = case when leaderboard_eligible then is_leaderboard_promoted else false end,
      leaderboard_promo_order = case when leaderboard_eligible then leaderboard_promo_order else null end
  where coalesce(is_demo, false) = false
    and city is not null
    and (p_city is null or city = p_city);

  -- Write the dynamic leaderboard order back into the legacy field that
  -- existing clients already consume. Only venues with a meaningful signal
  -- or real Spotted activity receive a ranked position.
  with ranked as (
    select
      s.venue_id,
      row_number() over (
        partition by s.city
        order by
          s.final_score desc,
          s.internet_score desc,
          s.unique_checkins_24h desc,
          s.unique_checkins_7d desc,
          s.venue_id
      )::integer as dynamic_rank
    from public.venue_leaderboard_scores s
    join public.venues v on v.id = s.venue_id
    where coalesce(v.is_demo, false) = false
      and v.leaderboard_eligible
      and (p_city is null or s.city = p_city)
      and (
        s.source_count > 0
        or s.unique_checkins_7d > 0
      )
  )
  update public.venues v
  set popularity_rank = r.dynamic_rank
  from ranked r
  where v.id = r.venue_id;
end;
$function$;

select internal.recompute_venue_leaderboard(null);
select internal.sync_venue_popularity_rank(null);
notify pgrst, 'reload schema';
