import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Real NYC top-tier venues (scraped from top rankings) - ordered by popularity
const NYC_VENUES = [
  // TOP 20 - Most popular venues (will be shown in leaderboard)
  { name: "Le Bain", lat: 40.7414, lng: -74.0078, rank: 1 },
  { name: "House of Yes", lat: 40.7089, lng: -73.9332, rank: 2 },
  { name: "The Box", lat: 40.7216, lng: -73.9935, rank: 3 },
  { name: "Elsewhere", lat: 40.7067, lng: -73.9278, rank: 4 },
  { name: "TBA Brooklyn", lat: 40.7234, lng: -73.9567, rank: 5 },
  { name: "Nowadays", lat: 40.7067, lng: -73.9278, rank: 6 },
  { name: "Double Chicken Please", lat: 40.7195, lng: -73.9921, rank: 7 },
  { name: "The Dead Rabbit", lat: 40.7040, lng: -74.0124, rank: 8 },
  { name: "Dante NYC", lat: 40.7310, lng: -74.0029, rank: 9 },
  { name: "Attaboy", lat: 40.7185, lng: -73.9885, rank: 10 },
  { name: "PHD Rooftop", lat: 40.7614, lng: -73.9776, rank: 11 },
  { name: "230 Fifth", lat: 40.7448, lng: -73.9873, rank: 12 },
  { name: "Schimanski", lat: 40.7089, lng: -73.9332, rank: 13 },
  { name: "Good Room", lat: 40.7089, lng: -73.9343, rank: 14 },
  { name: "Superbueno", lat: 40.7249, lng: -73.9865, rank: 15 },
  { name: "Sunken Harbor Club", lat: 40.6923, lng: -73.9872, rank: 16 },
  { name: "schmuck.", lat: 40.7251, lng: -73.9863, rank: 17 },
  { name: "Public Hotel Rooftop", lat: 40.7252, lng: -73.9881, rank: 18 },
  { name: "Jean's", lat: 40.7251, lng: -73.9988, rank: 19 },
  { name: "The Campbell", lat: 40.7527, lng: -73.9772, rank: 20 },
  
  // REMAINING 19 - Less popular, may not appear in demo leaderboard
  { name: "Bar Snack", lat: 40.7258, lng: -73.9874, rank: 21 },
  { name: "Saint Tuesday", lat: 40.7169, lng: -73.9982, rank: 22 },
  { name: "Sunn's", lat: 40.7161, lng: -73.9977, rank: 23 },
  { name: "The Mulberry", lat: 40.7221, lng: -73.9951, rank: 24 },
  { name: "Amber Room", lat: 40.7198, lng: -73.9891, rank: 25 },
  { name: "Patent Pending", lat: 40.7234, lng: -73.9914, rank: 26 },
  { name: "Ketchy Shuby", lat: 40.7231, lng: -73.9969, rank: 27 },
  { name: "Gospël", lat: 40.7241, lng: -73.9977, rank: 28 },
  { name: "Paul's Casablanca", lat: 40.7235, lng: -73.9969, rank: 29 },
  { name: "Paul's Cocktail Lounge", lat: 40.7171, lng: -74.0089, rank: 30 },
  { name: "The Nines", lat: 40.7268, lng: -73.9945, rank: 31 },
  { name: "Little Sister Lounge", lat: 40.7267, lng: -73.9857, rank: 32 },
  { name: "Unveiled", lat: 40.7106, lng: -73.9638, rank: 33 },
  { name: "Studio Maison Nur", lat: 40.6844, lng: -73.9529, rank: 34 },
];

// LA venues - ordered by popularity (40 venues - includes westside)
const LA_VENUES = [
  // Hollywood / West Hollywood / Downtown (ranks 1-20)
  { name: "Academy LA", lat: 34.0479, lng: -118.2565, rank: 1 },
  { name: "Sound Nightclub", lat: 34.0412, lng: -118.2468, rank: 2 },
  { name: "Exchange LA", lat: 34.0441, lng: -118.2504, rank: 3 },
  { name: "The Mayan", lat: 34.0493, lng: -118.2577, rank: 4 },
  { name: "Catch One", lat: 34.0352, lng: -118.3085, rank: 5 },
  { name: "Avalon Hollywood", lat: 34.1020, lng: -118.3268, rank: 6 },
  { name: "Break Room 86", lat: 34.0781, lng: -118.3650, rank: 7 },
  { name: "No Vacancy", lat: 34.0989, lng: -118.3267, rank: 8 },
  { name: "EP & LP", lat: 34.0789, lng: -118.3661, rank: 9 },
  { name: "Warwick", lat: 34.1019, lng: -118.3277, rank: 10 },
  // Santa Monica / Venice / Westside (ranks 11-18)
  { name: "The Bungalow", lat: 34.0062, lng: -118.4715, rank: 11 },
  { name: "The Galley", lat: 34.0082, lng: -118.4889, rank: 12 },
  { name: "Finn McCool's", lat: 34.0057, lng: -118.4799, rank: 13 },
  { name: "The Basement Tavern", lat: 34.0134, lng: -118.4917, rank: 14 },
  { name: "The Roosterfish", lat: 33.9920, lng: -118.4715, rank: 15 },
  { name: "The Townhouse & Del Monte Speakeasy", lat: 33.9934, lng: -118.4701, rank: 16 },
  { name: "High Rooftop Lounge", lat: 33.9913, lng: -118.4660, rank: 17 },
  { name: "Simmzy's Manhattan Beach", lat: 33.8846, lng: -118.4094, rank: 18 },
  // More Hollywood / DTLA (ranks 19-32)
  { name: "Nightingale Plaza", lat: 34.0789, lng: -118.3628, rank: 19 },
  { name: "Spotlight LA", lat: 34.0478, lng: -118.2505, rank: 20 },
  { name: "Resident", lat: 34.0488, lng: -118.2518, rank: 21 },
  { name: "Skybar", lat: 34.0949, lng: -118.3853, rank: 22 },
  { name: "Good Times at Davey Wayne's", lat: 34.0990, lng: -118.3855, rank: 23 },
  { name: "Seven Grand", lat: 34.0465, lng: -118.2508, rank: 24 },
  { name: "The Edison", lat: 34.0483, lng: -118.2513, rank: 25 },
  { name: "The Roger Room", lat: 34.0810, lng: -118.3700, rank: 26 },
  { name: "Dirty Laundry", lat: 34.0992, lng: -118.3291, rank: 27 },
  { name: "Clifton's Republic", lat: 34.0466, lng: -118.2507, rank: 28 },
  { name: "The Argyle", lat: 34.0985, lng: -118.3856, rank: 29 },
  { name: "Genghis Cohen", lat: 34.0989, lng: -118.3268, rank: 30 },
  { name: "The Escondite", lat: 34.0488, lng: -118.2506, rank: 31 },
  { name: "Adults Only", lat: 34.0448, lng: -118.2486, rank: 32 },
];

// REMOVED: DEMO_VENUES - these don't exist in the database
// All posts/stories/yaps now use only SELECTED_VENUES (real DB venues) for proper city filtering

const DEMO_USERS = [
  { display_name: 'Alex Rivera', username: 'alex_spotted', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', bio: 'NYC nightlife enthusiast 🌃' },
  { display_name: 'Sam Chen', username: 'samthenight', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam', bio: 'Always out, always vibing ✨' },
  { display_name: 'Jordan Lee', username: 'jordanspots', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', bio: 'Finding the best spots in Brooklyn' },
  { display_name: 'Taylor Kim', username: 'taylornights', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Taylor', bio: 'Dance floor detective 💃' },
  { display_name: 'Morgan Davis', username: 'morganthemover', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Morgan', bio: 'Music lover | Late night explorer' },
  { display_name: 'Casey Park', username: 'caseygoesout', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Casey', bio: 'Living for the weekend 🎉' },
  { display_name: 'Riley Thompson', username: 'rileyrave', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Riley', bio: 'Techno lover 🎧' },
  { display_name: 'Jamie Martinez', username: 'jamieout', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jamie', bio: 'Brooklyn based DJ' },
  { display_name: 'Avery Wilson', username: 'averynight', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Avery', bio: 'House music fanatic 🏠' },
  { display_name: 'Quinn Brown', username: 'quinnvibes', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Quinn', bio: 'Living for bass drops' },
  { display_name: 'Drew Anderson', username: 'drewdances', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Drew', bio: 'Dance till sunrise 🌅' },
  { display_name: 'Skylar Garcia', username: 'skylarnights', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Skylar', bio: 'NYC club explorer' },
  { display_name: 'Reese Johnson', username: 'reeseout', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Reese', bio: 'Warehouse party hunter 🏭' },
  { display_name: 'Peyton Miller', username: 'peytonspots', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Peyton', bio: 'Underground scene devotee' },
  { display_name: 'Emerson Lee', username: 'emersonvibes', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emerson', bio: 'Beats & good times 🎵' },
  { display_name: 'Cameron White', username: 'camnight', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Cameron', bio: 'Nightlife curator' },
  { display_name: 'Dakota Scott', username: 'dakotaraves', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dakota', bio: 'Always at the afters 🌙' },
  { display_name: 'Parker Adams', username: 'parkerspotted', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Parker', bio: 'Deep house devotee' },
  { display_name: 'Sage Turner', username: 'sagenights', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sage', bio: 'Brooklyn nightlife 💜' },
  { display_name: 'River Hayes', username: 'riverout', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=River', bio: 'Techno till dawn 🌃' },
];

const DEMO_CAPTIONS = [
  "This place is amazing! 🔥",
  "Best night ever with the crew 💯",
  "The vibes here are unmatched ✨",
  "Can't believe how packed it is tonight!",
  "DJ is killing it right now 🎵",
  "Found my new favorite spot 🌟",
  "Who else is here? Let's link up!",
  "This is what Saturday nights are for 🙌",
  "The energy in here is insane",
  "Making memories with my favorites ❤️",
];

const DEMO_POST_IMAGES = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1571266028243-d220c6563ccc?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1519167758481-83f29da8a97e?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=800&fit=crop",
];

const DEMO_REVIEW_IMAGES = [
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&h=400&fit=crop", // bar interior
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop", // drinks
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=400&fit=crop", // cocktails
  "https://images.unsplash.com/photo-1587574293340-e0011c4e8ecf?w=600&h=400&fit=crop", // club lights
  "https://images.unsplash.com/photo-1604882737321-e781f3cde3a5?w=600&h=400&fit=crop", // bar counter
  "https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=400&fit=crop", // drinks neon
  "https://images.unsplash.com/photo-1560148271-00b5e5850812?w=600&h=400&fit=crop", // club vibe
  "https://images.unsplash.com/photo-1563841930606-67e2bce48b78?w=600&h=400&fit=crop", // venue interior
];

// Demo buzz messages for Tonight's Buzz (Quick Vibes)
const DEMO_BUZZ_MESSAGES = [
  { text: "DJ is absolutely killing it right now 🔥", emoji_vibe: "🔥" },
  { text: "Line was long but SO worth it", emoji_vibe: "💃" },
  { text: "Best drinks in Brooklyn, hands down", emoji_vibe: "🍸" },
  { text: "The sound system here is insane", emoji_vibe: "🎵" },
  { text: "Crowd is perfect tonight ✨", emoji_vibe: "✨" },
  { text: "Just vibing", emoji_vibe: "💃" },
  { text: "This place never disappoints", emoji_vibe: "🔥" },
  { text: "Who else is here? The rooftop is packed!", emoji_vibe: "✨" },
  { text: "Energy is unmatched rn", emoji_vibe: "⚡" },
  { text: "3am and we're not leaving anytime soon", emoji_vibe: "🌙" },
  { text: "Bartender just made me something off menu 👀", emoji_vibe: "🍸" },
  { text: "Finally found my people here", emoji_vibe: "💜" },
];

// Demo media for buzz clips (stories with is_public_buzz = true)
const DEMO_BUZZ_MEDIA = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1587574293340-e0011c4e8ecf?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1571266028243-d220c6563ccc?w=800&h=800&fit=crop",
];

// Venue-specific reviews with accurate details from real-world research
const VENUE_SPECIFIC_REVIEWS: Record<string, { reviews: Array<{ text: string | null; rating: number }> }> = {
  "Le Bain": {
    reviews: [
      { text: "The rooftop views of the Hudson are incredible! Danced in the pool area until 3am. The DJs always deliver deep house vibes.", rating: 4 },
      { text: "Great vibes but it gets PACKED. Come early or expect a long wait. Worth it for the Standard views though.", rating: 3 },
      { text: "One of NYC's most iconic clubs. The sunset from up here is unmatched. Pool parties in summer are legendary.", rating: 5 },
      { text: "Door can be tough but once you're in, the energy is unreal. Rooftop dance floor with skyline views - can't beat it.", rating: 4 },
      { text: "A bit pretentious crowd sometimes but the music selection is always on point. Industrial chic aesthetic.", rating: 3 },
    ]
  },
  "House of Yes": {
    reviews: [
      { text: "If you want weird and wonderful, this is your spot. The aerial performances are mind-blowing! Most creative crowd in Brooklyn.", rating: 5 },
      { text: "Dress code is serious - costumes encouraged! Came as a disco ball and fit right in. Immersive shows are incredible.", rating: 5 },
      { text: "The circus performances during sets are like nothing else in NYC. Truly an experience, not just a club.", rating: 5 },
      { text: "Body positive, queer-friendly, and pure creative chaos. Everyone should experience this place at least once.", rating: 5 },
      { text: "Theme nights are insane - went to Dirty Circus and my mind was blown. Acrobats on the ceiling!", rating: 4 },
    ]
  },
  "The Box": {
    reviews: [
      { text: "The most provocative, boundary-pushing performances in NYC. Not for the faint of heart but absolutely unforgettable.", rating: 5 },
      { text: "Burlesque, variety acts, and pure debauchery. The shows are shocking in the best way. Very exclusive door.", rating: 4 },
      { text: "If you can get in, prepare for a wild ride. The performers are world-class and the crowd is A-list.", rating: 5 },
      { text: "Expensive but worth it for special occasions. The theatrical performances are truly one of a kind.", rating: 4 },
      { text: "Old school NYC nightlife energy. Dark, mysterious, and absolutely wild. Not your average night out.", rating: 5 },
    ]
  },
  "Elsewhere": {
    reviews: [
      { text: "Three floors of different vibes! The rooftop is perfect for breaks between dancing. Best sound system in Brooklyn.", rating: 5 },
      { text: "Zone One gets the best DJs. Saw a 6-hour set here that changed my life. True techno temple.", rating: 5 },
      { text: "Love that you can escape to the Hall or Loft when Zone One gets too intense. Something for everyone.", rating: 4 },
      { text: "The lineups are consistently incredible. From techno to indie, they book quality acts across genres.", rating: 5 },
      { text: "Industrial warehouse vibes done right. Good crowd, reasonable drinks, and dancing until sunrise.", rating: 4 },
    ]
  },
  "TBA Brooklyn": {
    reviews: [
      { text: "Warehouse vibes with amazing sound. The courtyard is perfect for summer nights. Real underground energy.", rating: 5 },
      { text: "Gets some of the best techno acts in the city. No frills, just great music and people who love to dance.", rating: 4 },
      { text: "Love the outdoor space. Perfect for those 4am breaks when you need fresh air before diving back in.", rating: 5 },
      { text: "Raw, industrial, and exactly what Brooklyn nightlife should be. Come for the music, stay for the vibes.", rating: 4 },
      { text: null, rating: 5 },
    ]
  },
  "Nowadays": {
    reviews: [
      { text: "The outdoor space is HUGE! Perfect for summer day parties. Great food vendors and chill daytime vibes.", rating: 5 },
      { text: "Love that it works both as a day party spot and late night club. The garden area is magical.", rating: 5 },
      { text: "Best sound system for an outdoor venue. They really care about the music quality here.", rating: 4 },
      { text: "Ridgewood gem! More relaxed than Williamsburg spots but still gets great DJs.", rating: 4 },
      { text: "Day parties here are legendary. BBQ, good tunes, and dancing in the sun. What more could you want?", rating: 5 },
    ]
  },
  "Double Chicken Please": {
    reviews: [
      { text: "Ranked #2 bar in North America for a reason. The cocktails are literal art. Try the off-menu specials!", rating: 5 },
      { text: "Best fried chicken sandwich in NYC, hands down. And the drinks are next level creative. Design-forward everything.", rating: 5 },
      { text: "Hard to get a reservation but SO worth it. Every cocktail tells a story. The presentation is insane.", rating: 5 },
      { text: "The upstairs speakeasy vibe is even better than downstairs. Ask about the secret menu!", rating: 5 },
      { text: "Innovative cocktails that actually taste amazing, not just look cool. Bartenders are true artists.", rating: 4 },
    ]
  },
  "The Dead Rabbit": {
    reviews: [
      { text: "Best Irish bar in America, full stop. The whiskey selection is unmatched and the cocktails are perfection.", rating: 5 },
      { text: "Three floors of different vibes - pub downstairs, cocktail parlor upstairs. The Irish coffee is legendary.", rating: 5 },
      { text: "Won World's Best Bar for good reason. Every drink is crafted with incredible attention to detail.", rating: 5 },
      { text: "The historical cocktail menu is fascinating. Like drinking through time. Staff really knows their stuff.", rating: 4 },
      { text: "Come early or wait forever. Worth the hype though - best cocktails in the Financial District.", rating: 4 },
    ]
  },
  "Dante NYC": {
    reviews: [
      { text: "World's Best Bar vibes! The Negronis here are perfection. Italian aperitivo culture done right in the Village.", rating: 5 },
      { text: "Garibaldi is their signature and it's incredible - fluffy orange juice with Campari. Brunch here is elite.", rating: 5 },
      { text: "Been around since 1915 and still killing it. Classic NYC institution with modern cocktail excellence.", rating: 5 },
      { text: "Outdoor seating on MacDougal is perfect for people watching. Spritz game is unmatched.", rating: 4 },
      { text: null, rating: 5 },
    ]
  },
  "Attaboy": {
    reviews: [
      { text: "No menu - just tell them what you like and they'll make magic. The bartenders here are true artists.", rating: 5 },
      { text: "Speakeasy vibes done right. Tiny space, incredible drinks, zero pretension. Just good conversation and great cocktails.", rating: 5 },
      { text: "From the Milk & Honey family. If you trust them, they'll make exactly what you didn't know you wanted.", rating: 5 },
      { text: "Best bespoke cocktail experience in NYC. Come with an open mind and let them surprise you.", rating: 4 },
      { text: "Intimate, personal, and genuinely great service. Worth the wait to get in.", rating: 5 },
    ]
  },
  "PHD Rooftop": {
    reviews: [
      { text: "Dream Hotel's crown jewel. The terrace views are stunning. Gets a bottle service crowd but the vibes are fun.", rating: 4 },
      { text: "Perfect for special occasions. Dress up, bring your credit card, and enjoy the skyline.", rating: 4 },
      { text: "Penthouse House vibes - literally. Great for impressing a date or celebrating with friends.", rating: 4 },
      { text: "Can be douchey on weekends but weeknight views are worth it. Sunset cocktails are magical.", rating: 3 },
      { text: null, rating: 4 },
    ]
  },
  "230 Fifth": {
    reviews: [
      { text: "Biggest rooftop in NYC! Empire State Building views are unreal. The robes in winter are iconic.", rating: 4 },
      { text: "Tourist trap? Maybe. But the views are genuinely incredible and the space is massive.", rating: 3 },
      { text: "Come for the views, not the drinks. Great for out-of-town guests who want the NYC experience.", rating: 3 },
      { text: "The heated rooftop garden in winter with the red robes is actually really fun.", rating: 4 },
      { text: "Basic but beautiful. Sometimes you just want to sip a drink with the Empire State Building in front of you.", rating: 4 },
    ]
  },
  "Schimanski": {
    reviews: [
      { text: "Williamsburg's best club for serious techno and house. The Funktion-One sound system hits different.", rating: 5 },
      { text: "Gets great international DJs. The room isn't huge but that makes it more intimate.", rating: 4 },
      { text: "Finally a club in Brooklyn that focuses on the music. None of the Manhattan pretension.", rating: 4 },
      { text: "Late night vibes only. Don't show up before 1am if you want to see it at its best.", rating: 4 },
      { text: null, rating: 5 },
    ]
  },
  "Good Room": {
    reviews: [
      { text: "Two rooms, two vibes! Front room for disco and funk, back room for deeper cuts. Perfect setup.", rating: 5 },
      { text: "Greenpoint's best kept secret. The sound is incredible and the crowd actually dances.", rating: 5 },
      { text: "Love the DJ booth in the middle of the dance floor. Real connection between artist and crowd.", rating: 4 },
      { text: "Not too big, not too small. Just the right size for a proper dance party.", rating: 4 },
      { text: "The outdoor back patio is clutch for breaks. Great programming across genres.", rating: 5 },
    ]
  },
  "Superbueno": {
    reviews: [
      { text: "East Village gem! Mezcal cocktails and late night dancing. The back room gets sweaty in the best way.", rating: 4 },
      { text: "Love the Mexican-inspired drinks. The vibe shifts from chill bar to dance party as the night goes on.", rating: 4 },
      { text: "No cover, great drinks, and actual dancing. What more could you want from an East Village spot?", rating: 5 },
      { text: "Neighborhood bar energy that transforms into a proper party. Love the unpretentious crowd.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Sunken Harbor Club": {
    reviews: [
      { text: "Tiki heaven in Carroll Gardens! The rum cocktails are legit and the tropical vibes transport you.", rating: 5 },
      { text: "Best tiki bar in Brooklyn. The attention to detail in the decor and drinks is impressive.", rating: 5 },
      { text: "Escape NYC without leaving. Every drink comes in beautiful vintage glassware.", rating: 4 },
      { text: "The Leyenda team knows their rum. Complex, balanced tiki drinks - not just sugar bombs.", rating: 5 },
      { text: null, rating: 4 },
    ]
  },
  "schmuck.": {
    reviews: [
      { text: "Jewish deli meets cocktail bar and it works! The pastrami is incredible and the drinks are creative.", rating: 4 },
      { text: "Only in NYC would a deli-bar concept work this well. Late night pastrami sandwiches hit different.", rating: 4 },
      { text: "Love the irreverent vibe. Great for a weird date or hanging with friends who appreciate the absurd.", rating: 4 },
      { text: "The cocktail menu is genuinely good, not just a gimmick. Plus midnight deli food.", rating: 5 },
      { text: null, rating: 4 },
    ]
  },
  "Public Hotel Rooftop": {
    reviews: [
      { text: "Ian Schrager's latest. The views are gorgeous and the design is impeccable. Very scene-y on weekends.", rating: 4 },
      { text: "Downtown views from above. The indoor/outdoor flow is great. Expect a fashionable crowd.", rating: 4 },
      { text: "Beautiful space, pricey drinks, but worth it for the atmosphere. Best at sunset.", rating: 4 },
      { text: null, rating: 4 },
      { text: "The rooftop pool scene in summer is legendary. Very European Riviera vibes.", rating: 5 },
    ]
  },
  "Jean's": {
    reviews: [
      { text: "NoMad hotel's hidden gem. Feels like a Parisian salon. The cocktails and small plates are refined.", rating: 5 },
      { text: "Sophisticated without being stuffy. Perfect for a grown-up night out in Midtown.", rating: 4 },
      { text: "Love the intimate booths. Great for conversation and actually being able to hear your friends.", rating: 4 },
      { text: "Daniel Boulud quality extends to the bar. Every cocktail is perfectly balanced.", rating: 5 },
      { text: null, rating: 4 },
    ]
  },
  "The Campbell": {
    reviews: [
      { text: "Grand Central's secret! The Jazz Age architecture is stunning. Feel like you're in The Great Gatsby.", rating: 5 },
      { text: "Historic space that was once a 1920s mogul's office. The hand-painted ceiling is jaw-dropping.", rating: 5 },
      { text: "Perfect pre-train cocktail spot. Classic drinks in an incomparable setting.", rating: 4 },
      { text: "Touristy but worth it. The room itself is the star - one of NYC's most beautiful bars.", rating: 4 },
      { text: "Old money vibes in the best way. Dress up and sip a martini like it's 1929.", rating: 5 },
    ]
  },
  "Bar Snack": {
    reviews: [
      { text: "Natural wines and creative small plates. The perfect neighborhood spot for East Village locals.", rating: 4 },
      { text: "Love the casual wine bar energy. Knowledgeable staff and interesting, affordable bottles.", rating: 4 },
      { text: "Great first date spot - intimate, not too loud, and the wine selection is curated.", rating: 4 },
      { text: null, rating: 4 },
      { text: "Finally a wine bar that doesn't feel pretentious. Just good juice and good vibes.", rating: 5 },
    ]
  },
  "Saint Tuesday": {
    reviews: [
      { text: "Speakeasy hidden in a taco shop! The cocktails are strong and the vibe is mysterious.", rating: 4 },
      { text: "The reveal when you walk through the back is so fun. Great for impressing a date.", rating: 4 },
      { text: "Dark, moody, and the drinks pack a punch. Perfect LES late night spot.", rating: 4 },
      { text: null, rating: 4 },
      { text: "One of the few speakeasies that's actually hard to find. Worth the hunt.", rating: 5 },
    ]
  },
  "Sunn's": {
    reviews: [
      { text: "Filipino flavors meet craft cocktails. The lumpia and drinks pairing is chef's kiss.", rating: 4 },
      { text: "Finally representation in the cocktail scene! The ube cocktail is beautiful and delicious.", rating: 5 },
      { text: "Small but mighty. The bartenders really care about what they're making.", rating: 4 },
      { text: "Love supporting this spot. Creative drinks with ingredients you don't see elsewhere.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "The Mulberry": {
    reviews: [
      { text: "Little Italy charm with solid cocktails. The outdoor seating on Mulberry is perfect for summer.", rating: 4 },
      { text: "Old school neighborhood bar energy. Nothing fancy but consistently good times.", rating: 4 },
      { text: "Great for pregaming before dinner in Little Italy. Classic drinks, friendly bartenders.", rating: 4 },
      { text: null, rating: 3 },
      { text: "Unpretentious spot in an increasingly touristy neighborhood. The locals still love it.", rating: 4 },
    ]
  },
  "Amber Room": {
    reviews: [
      { text: "Cozy cocktail lounge with vintage vibes. The amber lighting creates such a warm atmosphere.", rating: 4 },
      { text: "Great for intimate conversations. The seating is comfortable and drinks are well-crafted.", rating: 4 },
      { text: "Hidden gem in the neighborhood. Not trying to be anything other than a solid bar.", rating: 4 },
      { text: null, rating: 4 },
      { text: "The whiskey selection is impressive for such a small spot. Bartender knows their stuff.", rating: 4 },
    ]
  },
  "Patent Pending": {
    reviews: [
      { text: "Science-themed cocktails in NoMad! The presentation is wild - smoking beakers and all.", rating: 4 },
      { text: "More than a gimmick - the drinks actually taste great. Fun for groups.", rating: 4 },
      { text: "The laboratory aesthetic is Instagram gold. Come for the photos, stay for the cocktails.", rating: 4 },
      { text: "Creative and playful without being cheesy. Each drink is a little experiment.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Ketchy Shuby": {
    reviews: [
      { text: "NYC's only ski lodge bar! The apres-ski vibes are so fun, especially in winter.", rating: 4 },
      { text: "Raclette and mulled wine in Manhattan. The theme is committed and charming.", rating: 4 },
      { text: "Like being transported to the Alps. Cozy, kitschy, and genuinely enjoyable.", rating: 4 },
      { text: null, rating: 4 },
      { text: "Perfect for escaping the cold. The fondue and hot cocktails warm you right up.", rating: 5 },
    ]
  },
  "Gospël": {
    reviews: [
      { text: "Cajun brunch cocktails and Southern hospitality! The beignets are addictive.", rating: 4 },
      { text: "New Orleans vibes in NYC. The jazz brunch is a proper party.", rating: 4 },
      { text: "Strong drinks and bold flavors. Come hungry and thirsty.", rating: 4 },
      { text: "The Southern-inspired cocktails are creative and delicious. Great for groups.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Paul's Casablanca": {
    reviews: [
      { text: "Dive bar meets dance floor. The karaoke nights are legendary and the drinks are cheap.", rating: 4 },
      { text: "No pretense, just fun. This is what NYC nightlife used to be before everything got fancy.", rating: 4 },
      { text: "Late night chaos in the best way. The crowd is always down to party.", rating: 4 },
      { text: "Classic LES energy. Come after midnight when things really get going.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Paul's Cocktail Lounge": {
    reviews: [
      { text: "More refined than its sister spot but still fun. Great cocktails in a swanky setting.", rating: 4 },
      { text: "The velvet booths and disco ball give retro glam vibes. Perfect for date night.", rating: 4 },
      { text: "A little bit disco, a little bit lounge. The DJ sets are surprisingly good.", rating: 4 },
      { text: null, rating: 4 },
      { text: "Elevated without being pretentious. The sweet spot between dive bar and fancy cocktail spot.", rating: 4 },
    ]
  },
  "The Nines": {
    reviews: [
      { text: "Classic cocktails done right. The bartenders here really know their craft.", rating: 4 },
      { text: "Old fashioned specialists. If brown spirits are your thing, this is your spot.", rating: 4 },
      { text: "Intimate and sophisticated. Great for a nightcap after dinner.", rating: 4 },
      { text: null, rating: 4 },
      { text: "No frills, just excellent drinks. The kind of bar every neighborhood needs.", rating: 4 },
    ]
  },
  "Little Sister Lounge": {
    reviews: [
      { text: "Asian-inspired cocktails with a clubby vibe. The lychee martini is dangerously good.", rating: 4 },
      { text: "Late night spot that actually has good drinks. The crowd is fun and the music is decent.", rating: 4 },
      { text: "Great for groups who want to drink and dance. More lounge than club but gets going late.", rating: 4 },
      { text: null, rating: 4 },
      { text: "The Pan-Asian cocktails are creative and strong. Perfect LES after hours spot.", rating: 4 },
    ]
  },
  "Unveiled": {
    reviews: [
      { text: "Bushwick underground vibes! The warehouse setting is authentic and the music is always fire.", rating: 4 },
      { text: "Real Brooklyn nightlife energy. Come for the late night sets and stay till sunrise.", rating: 4 },
      { text: "No fancy bottle service, just good DJs and people who love to dance.", rating: 5 },
      { text: "The outdoor area is perfect for Brooklyn summer nights. Great local scene.", rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Studio Maison Nur": {
    reviews: [
      { text: "Bed-Stuy's best kept secret! The space is beautiful and the vibe is inclusive.", rating: 5 },
      { text: "Black-owned and community-focused. The events here celebrate culture and creativity.", rating: 5 },
      { text: "More than a bar - it's a creative space. The programming is always interesting.", rating: 4 },
      { text: "Love the intimate setting. Great for actually connecting with people.", rating: 4 },
      { text: null, rating: 5 },
    ]
  },
};

// LA venue-specific reviews (minimal set for key venues)
const LA_VENUE_SPECIFIC_REVIEWS: Record<string, { reviews: Array<{ text: string | null; rating: number }> }> = {
  "Academy LA": {
    reviews: [
      { text: "Best sound system in LA! The DJ lineups are insane. True underground vibe.", rating: 5 },
      { text: "DTLA's premier techno spot. Gets packed but the energy is worth it.", rating: 4 },
      { text: "No frills, just great music and people who actually love to dance.", rating: 5 },
      { text: null, rating: 4 },
      { text: null, rating: 5 },
    ]
  },
  "Sound Nightclub": {
    reviews: [
      { text: "Massive club with incredible production. The light shows are next level.", rating: 4 },
      { text: "Gets the biggest EDM acts. If you want the LA mega-club experience, this is it.", rating: 4 },
      { text: "Three floors of different vibes. Sound quality lives up to the name.", rating: 5 },
      { text: null, rating: 4 },
      { text: null, rating: 4 },
    ]
  },
  "Exchange LA": {
    reviews: [
      { text: "The old stock exchange building is stunning! Historic LA architecture meets modern clubbing.", rating: 5 },
      { text: "World-class DJs in a gorgeous space. One of LA's most iconic venues.", rating: 5 },
      { text: "The main room is breathtaking. Multiple floors and spaces to explore.", rating: 4 },
      { text: null, rating: 5 },
      { text: null, rating: 4 },
    ]
  },
  "The Mayan": {
    reviews: [
      { text: "The Mayan temple decor is wild! Unique atmosphere you won't find anywhere else.", rating: 4 },
      { text: "Gets great Latin music nights. The architecture alone is worth the visit.", rating: 4 },
      { text: "Historic venue with character. Multiple levels and balconies.", rating: 4 },
      { text: null, rating: 3 },
      { text: null, rating: 4 },
    ]
  },
  "EP & LP": {
    reviews: [
      { text: "Best rooftop bar in West Hollywood! The Asian fusion food is actually good.", rating: 5 },
      { text: "Upstairs EP has stunning views, downstairs LP has the party vibe. Love both.", rating: 5 },
      { text: "Great for sunset drinks before hitting the clubs. The cocktails are top tier.", rating: 4 },
      { text: null, rating: 5 },
      { text: null, rating: 4 },
    ]
  },
  "The Bungalow": {
    reviews: [
      { text: "Santa Monica beach vibes! Perfect day-to-night spot with ocean breeze.", rating: 5 },
      { text: "Feels like a beachside house party. More relaxed than Hollywood spots.", rating: 4 },
      { text: "Great cocktails and the patio is amazing. Worth the drive to the beach.", rating: 4 },
      { text: null, rating: 4 },
      { text: null, rating: 5 },
    ]
  },
};

const DEMO_YAP_MESSAGES = [
  { text: "Pretty sure Justin Bieber just walked in...", score: 78, comments: 9 },
  { text: "This music is awesome who's the DJ right now", score: 50, comments: 9 },
  { text: "What's the story with this couple at the bar they've been fighting for the past hr", score: 45, comments: 9 },
  { text: "What's everyone's move after close?", score: 5, comments: 9 },
  { text: "The bouncer is a douche!", score: 9, comments: 9 },
  { text: "Anyone here? Looking for my friends 👀", score: 12, comments: 3 },
  { text: "This DJ set is unreal!!!", score: 67, comments: 12 },
  { text: "Line is crazy long outside", score: 23, comments: 6 },
  { text: "Just got here, who's around?", score: 8, comments: 2 },
  { text: "The energy is INSANE right now", score: 89, comments: 15 },
  { text: "Best spot in Brooklyn hands down", score: 42, comments: 7 },
  { text: "Dance floor is PACKED", score: 34, comments: 5 },
  { text: "Where's the after party at?", score: 19, comments: 11 },
  { text: "This place never disappoints", score: 56, comments: 4 },
  { text: "Lost my friend, if you see them tell them I'm by the bar", score: 15, comments: 8 },
  { text: "Bartender hooked it up 🍹", score: 31, comments: 6 },
  { text: "This lineup is fire", score: 72, comments: 10 },
  { text: "Why is everyone so good looking here??", score: 93, comments: 18 },
  { text: "Sound system goes crazy", score: 61, comments: 7 },
  { text: "Cover was worth it", score: 27, comments: 4 },
];

function calculateExpiryTime(): string {
  const now = new Date();
  now.setHours(now.getHours() + 4);
  return now.toISOString();
}

function getRecentTimestamp(hoursAgo: number = 4): string {
  const now = new Date();
  const randomMinutesAgo = Math.floor(Math.random() * hoursAgo * 60);
  const timestamp = new Date(now.getTime() - randomMinutesAgo * 60000);
  return timestamp.toISOString();
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, city = 'nyc' } = await req.json();

    if (action === 'seed') {
      // Select venues based on city (defaults to NYC)
      const SELECTED_VENUES = city === 'la' ? LA_VENUES : NYC_VENUES;
      const SELECTED_REVIEWS = city === 'la' ? LA_VENUE_SPECIFIC_REVIEWS : VENUE_SPECIFIC_REVIEWS;
      
      // Clean up existing demo data before seeding
      console.log('Cleaning up existing demo data...');
      const { data: existingDemoProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('is_demo', true);
      const existingDemoIds = existingDemoProfiles?.map(p => p.id) || [];

      if (existingDemoIds.length > 0) {
        // Delete DM-related data first
        const { data: demoThreads } = await supabaseAdmin
          .from('dm_thread_members')
          .select('thread_id')
          .in('user_id', existingDemoIds);
        const threadIds = [...new Set(demoThreads?.map(t => t.thread_id) || [])];
        
        if (threadIds.length > 0) {
          await supabaseAdmin.from('dm_messages').delete().in('thread_id', threadIds);
          await supabaseAdmin.from('dm_thread_members').delete().in('thread_id', threadIds);
          await supabaseAdmin.from('dm_threads').delete().in('id', threadIds);
        }

        // Delete post-related data
        const { data: demoPosts } = await supabaseAdmin
          .from('posts')
          .select('id')
          .eq('is_demo', true);
        const postIds = demoPosts?.map(p => p.id) || [];
        
        if (postIds.length > 0) {
          await supabaseAdmin.from('post_likes').delete().in('post_id', postIds);
          await supabaseAdmin.from('post_comments').delete().in('post_id', postIds);
        }
        await supabaseAdmin.from('posts').delete().eq('is_demo', true);

        // Delete yap-related data
        const { data: demoYaps } = await supabaseAdmin
          .from('yap_messages')
          .select('id')
          .eq('is_demo', true);
        const yapIds = demoYaps?.map(y => y.id) || [];
        
        if (yapIds.length > 0) {
          const { data: demoYapComments } = await supabaseAdmin
            .from('yap_comments')
            .select('id')
            .eq('is_demo', true);
          const yapCommentIds = demoYapComments?.map(c => c.id) || [];
          
          if (yapCommentIds.length > 0) {
            await supabaseAdmin.from('yap_comment_votes').delete().in('comment_id', yapCommentIds);
          }
          await supabaseAdmin.from('yap_comments').delete().eq('is_demo', true);
          await supabaseAdmin.from('yap_votes').delete().in('yap_id', yapIds);
        }
        await supabaseAdmin.from('yap_messages').delete().eq('is_demo', true);

        // Delete story-related data
        await supabaseAdmin.from('story_views').delete().in('user_id', existingDemoIds);
        await supabaseAdmin.from('stories').delete().eq('is_demo', true);

        // Delete venue reviews
        const { data: demoReviews } = await supabaseAdmin
          .from('venue_reviews')
          .select('id')
          .in('user_id', existingDemoIds);
        const reviewIds = demoReviews?.map(r => r.id) || [];
        
        if (reviewIds.length > 0) {
          await supabaseAdmin.from('review_votes').delete().in('review_id', reviewIds);
        }
        await supabaseAdmin.from('venue_reviews').delete().in('user_id', existingDemoIds);

        // Delete location-related data
        await supabaseAdmin.from('checkins').delete().eq('is_demo', true);
        await supabaseAdmin.from('night_statuses').delete().eq('is_demo', true);

        // Delete friendships
        await supabaseAdmin.from('close_friends').delete().in('user_id', existingDemoIds);
        await supabaseAdmin.from('close_friends').delete().in('close_friend_id', existingDemoIds);
        await supabaseAdmin.from('friendships').delete().in('user_id', existingDemoIds);
        await supabaseAdmin.from('friendships').delete().in('friend_id', existingDemoIds);
      }

      // Delete demo venues and profiles last
      await supabaseAdmin.from('venues').delete().eq('is_demo', true);
      await supabaseAdmin.from('profiles').delete().eq('is_demo', true);
      
      console.log('Cleanup complete. Starting fresh seed...');
      
      const demoUserIds: string[] = [];
      const DEMO_USER_COUNT = 50; // Create 50 users for better venue distribution

      // 1. Create demo profiles
      console.log('Creating 50 demo users...');
      const timestamp = Date.now();
      for (let i = 0; i < DEMO_USER_COUNT; i++) {
        // Cycle through the 20 base demo users, repeating as needed
        const demoUser = DEMO_USERS[i % DEMO_USERS.length];
        const userId = crypto.randomUUID();
        demoUserIds.push(userId);

        const { error } = await supabaseAdmin.from('profiles').insert({
          id: userId,
          display_name: demoUser.display_name,
          username: `${demoUser.username}_${timestamp}_${i}`,
          avatar_url: demoUser.avatar_url,
          bio: demoUser.bio,
          is_demo: true,
        });

        if (error) {
          console.error(`Error creating demo user ${i}:`, error);
          throw error;
        }
      }

      // 2. Get ALL real (non-demo) users and create friendships with demo users
      const { data: realUsers } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('is_demo', false);

      const realUserIds = realUsers?.map(u => u.id) || [];
      console.log(`Found ${realUserIds.length} real users to befriend demo users`);

      // Create friendships between ALL real users and ALL demo users
      const allFriendships: Array<{ user_id: string; friend_id: string; status: string }> = [];
      for (const realUserId of realUserIds) {
        for (const demoUserId of demoUserIds) {
          allFriendships.push({
            user_id: realUserId,
            friend_id: demoUserId,
            status: 'accepted',
          });
        }
      }

      if (allFriendships.length > 0) {
        await supabaseAdmin.from('friendships').insert(allFriendships);
        console.log(`Created ${allFriendships.length} friendships for ${realUserIds.length} real users`);
      }

      // 3. Create friendships between demo users
      const demoFriendships: Array<{ user_id: string; friend_id: string; status: string }> = [];
      for (let i = 0; i < demoUserIds.length; i++) {
        const numFriends = 5 + Math.floor(Math.random() * 4);
        const potentialFriends = demoUserIds.filter((_, idx) => idx !== i);
        const friends = getRandomItems(potentialFriends, numFriends);

        for (const friendId of friends) {
          const exists = demoFriendships.some(
            f => (f.user_id === demoUserIds[i] && f.friend_id === friendId) ||
                 (f.user_id === friendId && f.friend_id === demoUserIds[i])
          );
          if (!exists) {
            demoFriendships.push({
              user_id: demoUserIds[i],
              friend_id: friendId,
              status: 'accepted',
            });
          }
        }
      }

      if (demoFriendships.length > 0) {
        await supabaseAdmin.from('friendships').insert(demoFriendships);
      }

      // 4. Insert all venues into venues table first (city-specific)
      console.log(`Inserting ${city.toUpperCase()} venues...`);
      
      // Define promoted venues per city
      const NYC_PROMOTED_NAMES = ['Unveiled', 'Studio Maison Nur', 'Little Sister Lounge', 'Patent Pending'];
      const LA_PROMOTED_NAMES = ['Adults Only', 'Bootleg Theater', 'The Falls', 'The Escondite'];
      const PROMOTED_VENUE_NAMES = city === 'la' ? LA_PROMOTED_NAMES : NYC_PROMOTED_NAMES;
      
      const venuesToInsert = SELECTED_VENUES.map(v => ({
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        neighborhood: city === 'la' ? 'Los Angeles' : 'Manhattan', // Will be derived from coordinates in production
        type: 'nightclub',
        is_demo: true,
        is_promoted: PROMOTED_VENUE_NAMES.includes(v.name),
        popularity_rank: v.rank,
        city: city,
      }));

      const { data: insertedVenues, error: venuesError } = await supabaseAdmin
        .from('venues')
        .upsert(venuesToInsert, { onConflict: 'name', ignoreDuplicates: false })
        .select('id, name');

      if (venuesError) {
        console.error('Error inserting venues:', venuesError);
        throw venuesError;
      }

      // Create lookup map: venue name -> venue ID
      const venueIdMap = new Map(insertedVenues.map(v => [v.name, v.id]));
      console.log(`Inserted ${insertedVenues.length} venues`);

      // 5. Create night statuses - popularity-based distribution
      console.log('Creating night statuses with popularity-based distribution...');
      
      const nightStatuses = [];
      const TOP_20_VENUES = SELECTED_VENUES.slice(0, 20); // Top 20 by popularity_rank
      const PROMOTED_VENUES = SELECTED_VENUES.filter(v => PROMOTED_VENUE_NAMES.includes(v.name));
      
      // Reserve last 4 demo users for promoted venues (ensures promoted venues have activity)
      const promotedUserStartIndex = demoUserIds.length - 4;
      
      // First 20 users: assign one to each top 20 venue (ensures all top 20 have at least 1 user)
      for (let i = 0; i < 20; i++) {
        const venue = TOP_20_VENUES[i];
        const venueId = venueIdMap.get(venue.name);
        
        nightStatuses.push({
          user_id: demoUserIds[i],
          status: 'out',
          venue_id: venueId,
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(),
          is_demo: true,
          is_promoted: false,
        });
      }
      
      // Next 26 users (index 20-45): distribute biased toward top venues
      for (let i = 20; i < promotedUserStartIndex; i++) {
        const rand = Math.random();
        let selectedVenue;
        
        if (rand < 0.5) {
          selectedVenue = TOP_20_VENUES[Math.floor(Math.random() * 5)];
        } else if (rand < 0.85) {
          selectedVenue = TOP_20_VENUES[5 + Math.floor(Math.random() * 10)];
        } else {
          selectedVenue = TOP_20_VENUES[15 + Math.floor(Math.random() * 5)];
        }
        
        const venueId = venueIdMap.get(selectedVenue.name);
        
        nightStatuses.push({
          user_id: demoUserIds[i],
          status: 'out',
          venue_id: venueId,
          venue_name: selectedVenue.name,
          lat: selectedVenue.lat,
          lng: selectedVenue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(),
          is_demo: true,
          is_promoted: false,
        });
      }
      
      // Last 4 users (index 46-49): assign to promoted venues (ensures they have activity)
      console.log('Adding demo users to promoted venues...');
      for (let i = 0; i < PROMOTED_VENUES.length && i < 4; i++) {
        const venue = PROMOTED_VENUES[i];
        const venueId = venueIdMap.get(venue.name);
        const userId = demoUserIds[promotedUserStartIndex + i];
        
        nightStatuses.push({
          user_id: userId,
          status: 'out',
          venue_id: venueId,
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(),
          is_demo: true,
          is_promoted: true,
        });
      }
      
      await supabaseAdmin.from('night_statuses').insert(nightStatuses);

      // 6. Create check-ins matching the night statuses
      console.log('Creating check-ins...');
      const checkins = [];
      for (const status of nightStatuses) {
        checkins.push({
          user_id: status.user_id,
          venue_id: status.venue_id,
          venue_name: status.venue_name,
          lat: status.lat,
          lng: status.lng,
          created_at: getRecentTimestamp(),
          is_demo: true,
          is_promoted: false,
        });
      }

      await supabaseAdmin.from('checkins').insert(checkins);

      // 7. Create posts with real venues from database
      const posts = [];
      for (let i = 0; i < 60; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        // Always use SELECTED_VENUES (real DB venues) for proper city filtering
        const venue = SELECTED_VENUES[Math.floor(Math.random() * SELECTED_VENUES.length)];
        const venueId = venueIdMap.get(venue.name);
        const caption = DEMO_CAPTIONS[Math.floor(Math.random() * DEMO_CAPTIONS.length)];
        
        // 60% of posts have images
        const hasImage = Math.random() < 0.6;
        const imageUrl = hasImage ? DEMO_POST_IMAGES[Math.floor(Math.random() * DEMO_POST_IMAGES.length)] : null;

        posts.push({
          user_id: userId,
          text: caption,
          image_url: imageUrl,
          venue_id: venueId,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(4),
          is_demo: true,
          is_promoted: false,
        });
      }
      await supabaseAdmin.from('posts').insert(posts);

      // 6.5 Create post comments
      const postComments = [];
      const postsWithComments = getRandomItems(posts, 30); // Add comments to ~30 posts
      
      for (const post of postsWithComments) {
        const numComments = 1 + Math.floor(Math.random() * 4); // 1-4 comments per post
        const commenters = getRandomItems(demoUserIds, numComments);
        
        for (const commenterId of commenters) {
          const commentTexts = [
            "Looks amazing! 🔥",
            "Wish I was there!",
            "So jealous rn 😭",
            "See you there!",
            "On my way!",
            "This place is fire",
            "Need to check this out",
            "Vibes look incredible",
            "Best spot ever",
            "Let's go there next weekend!",
          ];
          
          const commentText = commentTexts[Math.floor(Math.random() * commentTexts.length)];
          
          postComments.push({
            post_id: posts.indexOf(post), // This will be fixed below
            user_id: commenterId,
            text: commentText,
            created_at: new Date(new Date(post.created_at).getTime() + Math.random() * 2 * 60 * 60 * 1000).toISOString(),
          });
        }
      }

      // We need to insert posts first to get their IDs, then insert comments
      // So we'll do this differently
      const { data: insertedPosts } = await supabaseAdmin.from('posts').select('id').order('created_at', { ascending: false }).limit(60);
      
      if (insertedPosts && insertedPosts.length > 0) {
        const postCommentsWithIds = [];
        const randomPosts = getRandomItems(insertedPosts, 30);
        
        for (const post of randomPosts) {
          const numComments = 1 + Math.floor(Math.random() * 4);
          const commenters = getRandomItems(demoUserIds, numComments);
          
          for (const commenterId of commenters) {
            const commentTexts = [
              "Looks amazing! 🔥",
              "Wish I was there!",
              "So jealous rn 😭",
              "See you there!",
              "On my way!",
              "This place is fire",
              "Need to check this out",
              "Vibes look incredible",
              "Best spot ever",
              "Let's go there next weekend!",
            ];
            
            postCommentsWithIds.push({
              post_id: post.id,
              user_id: commenterId,
              text: commentTexts[Math.floor(Math.random() * commentTexts.length)],
              created_at: getRecentTimestamp(3),
            });
          }
        }
        
        if (postCommentsWithIds.length > 0) {
          await supabaseAdmin.from('post_comments').insert(postCommentsWithIds);
        }
      }

      // 7. Create yap messages with scores and handles
      const hottestVenues = getRandomItems([...SELECTED_VENUES], 10);
      const yapMessages = [];

      for (let i = 0; i < 40; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = hottestVenues[i % hottestVenues.length];
        const yapData = DEMO_YAP_MESSAGES[i % DEMO_YAP_MESSAGES.length];
        const isPromotedVenue = SELECTED_VENUES.some((v: any) => v.name === venue.name);
        
        // Generate anonymous handle
        const handle = `User${Math.floor(100000 + Math.random() * 900000)}`;
        
        // Calculate time ago (2m, 4m, 7m, 9m, 13m pattern)
        const minutesAgo = [2, 4, 7, 9, 13, 18, 25, 32, 45, 62][i % 10];
        const timestamp = new Date(Date.now() - minutesAgo * 60000);

        yapMessages.push({
          user_id: userId,
          text: yapData.text,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: timestamp.toISOString(),
          is_anonymous: true,
          author_handle: handle,
          score: yapData.score,
          comments_count: yapData.comments,
          is_demo: true,
          is_promoted: isPromotedVenue,
        });
      }
      
      // Insert yap messages and get their IDs back
      const { data: insertedYaps } = await supabaseAdmin
        .from('yap_messages')
        .insert(yapMessages)
        .select('id, comments_count');

      // 7.5 Create demo comments for yap messages
      console.log('Creating demo yap comments...');
      const yapCommentTemplates = [
        "lmaooo no way 💀",
        "fr fr",
        "I saw that too!!",
        "who?? 👀",
        "nah you're lying",
        "this is wild",
        "deadass",
        "omg same",
        "where exactly?",
        "let's gooo",
        "I'm dying 😂",
        "facts",
        "wait which one",
        "no shot",
        "for real though",
        "bruh moment",
        "I can't 😭",
        "tell me more",
        "need context",
        "spill the tea ☕",
      ];

      const yapComments = [];
      for (const yap of insertedYaps || []) {
        const commentCount = yap.comments_count || 0;
        for (let i = 0; i < commentCount; i++) {
          const commentUserId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
          const commentHandle = `User${Math.floor(100000 + Math.random() * 900000)}`;
          const commentMinutesAgo = Math.floor(Math.random() * 25) + 1;
          
          yapComments.push({
            yap_id: yap.id,
            user_id: commentUserId,
            text: yapCommentTemplates[Math.floor(Math.random() * yapCommentTemplates.length)],
            is_anonymous: true,
            author_handle: commentHandle,
            score: Math.floor(Math.random() * 15) - 3, // -3 to 11 range
            is_demo: true,
            created_at: new Date(Date.now() - commentMinutesAgo * 60000).toISOString(),
          });
        }
      }

      if (yapComments.length > 0) {
        await supabaseAdmin.from('yap_comments').insert(yapComments);
        console.log(`Created ${yapComments.length} demo yap comments`);
      }

      // 8. Create stories for demo users
      const storyUsers = getRandomItems(demoUserIds, 15); // 15 users with stories
      const stories = [];
      const storyVenues = getRandomItems([...SELECTED_VENUES], 10);
      
      for (const userId of storyUsers) {
        const numStories = 1 + Math.floor(Math.random() * 3); // 1-3 stories per user
        
        for (let i = 0; i < numStories; i++) {
          const venue = storyVenues[Math.floor(Math.random() * storyVenues.length)];
          stories.push({
            user_id: userId,
            media_url: DEMO_POST_IMAGES[Math.floor(Math.random() * DEMO_POST_IMAGES.length)],
            media_type: 'image',
            venue_name: venue.name,
            created_at: getRecentTimestamp(12), // Stories from last 12 hours
            expires_at: calculateExpiryTime(),
            is_demo: true,
        });
        }
      }
      
      if (stories.length > 0) {
        await supabaseAdmin.from('stories').insert(stories);
      }

      // 9. Create venue reviews with real-world accurate data
      console.log('Creating demo venue reviews with accurate data...');
      const venueReviews = [];
      
      // Create reviews for all selected city venues using venue-specific data
      for (const venue of SELECTED_VENUES) {
        const venueId = venueIdMap.get(venue.name);
        if (!venueId) continue;
        
        const venueReviewData = SELECTED_REVIEWS[venue.name];
        if (!venueReviewData) continue;
        
        const reviewers = getRandomItems(demoUserIds, venueReviewData.reviews.length);
        
        for (let i = 0; i < venueReviewData.reviews.length; i++) {
          const review = venueReviewData.reviews[i];
          const hasImage = Math.random() < 0.4; // 40% have images
          const imageUrl = hasImage ? DEMO_REVIEW_IMAGES[Math.floor(Math.random() * DEMO_REVIEW_IMAGES.length)] : null;
          const isAnonymous = Math.random() < 0.3; // 30% anonymous
          const score = Math.floor(Math.random() * 20) - 3; // -3 to 16 score range
          
          venueReviews.push({
            venue_id: venueId,
            user_id: reviewers[i],
            rating: review.rating,
            review_text: review.text,
            is_anonymous: isAnonymous,
            image_url: imageUrl,
            score,
            created_at: getRecentTimestamp(168), // Reviews from last 7 days
          });
        }
      }
      
      if (venueReviews.length > 0) {
        // Use upsert to handle potential duplicates
        const { error: reviewsError } = await supabaseAdmin
          .from('venue_reviews')
          .insert(venueReviews);
          
        if (reviewsError) {
          console.error('Error inserting reviews:', reviewsError);
        } else {
          console.log(`Created ${venueReviews.length} demo venue reviews`);
        }
      }

      // 10. Create demo message threads with current user
      console.log('Creating demo message threads...');
      const messageThreadUsers = getRandomItems(demoUserIds, 6); // 6 conversations
      
      // Pick venues from the selected city for message threads
      const topVenues = SELECTED_VENUES.slice(0, 3); // Use top 3 venues from city
      const threadConfigs = [
        { venue: topVenues[0].name, lastMessage: "Yeah I'm heading there now!", minutesAgo: 4, hasMultiple: true },
        { venue: topVenues[1].name, lastMessage: "Come it's popping off...", minutesAgo: 5, hasMultiple: false },
        { venue: topVenues[1].name, lastMessage: "See you soon!", minutesAgo: 10, hasMultiple: false },
        { venue: topVenues[2].name, lastMessage: "Just got here!", minutesAgo: 12, hasMultiple: false },
        { venue: topVenues[0].name, lastMessage: "Where are you?", minutesAgo: 15, hasMultiple: true },
        { venue: topVenues[0].name, lastMessage: "This place is amazing!", minutesAgo: 20, hasMultiple: true },
      ];
      
      let threadCount = 0;
      for (let i = 0; i < messageThreadUsers.length; i++) {
        const demoUserId = messageThreadUsers[i];
        const config = threadConfigs[i];
        
        // Create thread
        const { data: newThread, error: threadError } = await supabaseAdmin
          .from('dm_threads')
          .insert({})
          .select()
          .single();
          
        if (threadError || !newThread) {
          console.error('Error creating thread:', threadError);
          continue;
        }
        
        // Add thread members
        const { error: membersError } = await supabaseAdmin
          .from('dm_thread_members')
          .insert([
            { thread_id: newThread.id, user_id: user.id },
            { thread_id: newThread.id, user_id: demoUserId },
          ]);
          
        if (membersError) {
          console.error('Error adding thread members:', membersError);
          continue;
        }
        
        // Create messages in thread
        const messageTimestamp = new Date(Date.now() - config.minutesAgo * 60000);
        const messages = [];
        
        if (config.hasMultiple) {
          // Create 2-3 recent messages for threads with multiple messages
          messages.push({
            thread_id: newThread.id,
            sender_id: demoUserId,
            text: config.lastMessage,
            created_at: messageTimestamp.toISOString(),
          });
          messages.push({
            thread_id: newThread.id,
            sender_id: user.id,
            text: "Nice! What's the vibe?",
            created_at: new Date(messageTimestamp.getTime() - 60000).toISOString(),
          });
        } else {
          // Single message for simpler threads
          messages.push({
            thread_id: newThread.id,
            sender_id: demoUserId,
            text: config.lastMessage,
            created_at: messageTimestamp.toISOString(),
          });
        }
        
        await supabaseAdmin.from('dm_messages').insert(messages);
        
        // Update demo user's venue in night_statuses
        const venueData = SELECTED_VENUES.find((v: any) => v.name === config.venue) || SELECTED_VENUES[0];
        const venueId = venueIdMap.get(venueData.name);
        
        await supabaseAdmin.from('night_statuses').upsert({
          user_id: demoUserId,
          status: 'out',
          venue_id: venueId,
          venue_name: venueData.name,
          lat: venueData.lat,
          lng: venueData.lng,
          expires_at: calculateExpiryTime(),
          updated_at: messageTimestamp.toISOString(),
          is_demo: true,
          is_promoted: true,
        });
        
        threadCount++;
      }

      // Create demo buzz data for Tonight's Buzz
      const buzzMessages = [];
      const buzzStories = [];
      const buzzVenues = SELECTED_VENUES.slice(0, 10); // Top 10 venues get buzz data

      for (const venue of buzzVenues) {
        const venueId = venueIdMap.get(venue.name);
        if (!venueId) continue;

        // Add 3-5 text buzz messages per venue
        const numMessages = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numMessages; i++) {
          const buzz = DEMO_BUZZ_MESSAGES[Math.floor(Math.random() * DEMO_BUZZ_MESSAGES.length)];
          const randomUser = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
          const minutesAgo = Math.floor(Math.random() * 180); // Within last 3 hours
          
          buzzMessages.push({
            user_id: randomUser,
            venue_id: venueId,
            venue_name: venue.name,
            text: buzz.text,
            emoji_vibe: buzz.emoji_vibe,
            is_anonymous: Math.random() > 0.3, // 70% anonymous
            expires_at: calculateExpiryTime(),
            created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
            is_demo: true,
          });
        }

        // Add 1-2 media clips (stories with is_public_buzz) per top 5 venues
        if (buzzVenues.indexOf(venue) < 5) {
          const numClips = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < numClips; i++) {
            const mediaUrl = DEMO_BUZZ_MEDIA[Math.floor(Math.random() * DEMO_BUZZ_MEDIA.length)];
            const randomUser = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
            const minutesAgo = Math.floor(Math.random() * 120); // Within last 2 hours
            
            buzzStories.push({
              user_id: randomUser,
              venue_id: venueId,
              venue_name: venue.name,
              media_url: mediaUrl,
              media_type: 'image',
              is_public_buzz: true,
              is_anonymous: Math.random() > 0.7, // 30% anonymous for clips
              expires_at: calculateExpiryTime(),
              created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
              is_demo: true,
            });
          }
        }
      }

      // Insert buzz data
      if (buzzMessages.length > 0) {
        await supabaseAdmin.from('venue_buzz_messages').insert(buzzMessages);
      }
      if (buzzStories.length > 0) {
        await supabaseAdmin.from('stories').insert(buzzStories);
      }

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            users: demoUserIds.length,
            posts: 60,
            stories: stories.length + buzzStories.length,
            yaps: yapMessages.length,
            threads: threadCount,
            venues: SELECTED_VENUES.length,
            activeUsers: nightStatuses.length,
            buzzMessages: buzzMessages.length,
            city: city,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'clear') {
      // Get demo profile IDs first
      const { data: demoProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('is_demo', true);
      const demoIds = demoProfiles?.map(p => p.id) || [];
      
      // Get demo post IDs
      const { data: demoPosts } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('is_demo', true);
      const postIds = demoPosts?.map(p => p.id) || [];
      
      // Get threads involving demo users
      const { data: demoThreads } = await supabaseAdmin
        .from('dm_thread_members')
        .select('thread_id')
        .in('user_id', demoIds);
      const threadIds = demoThreads?.map(t => t.thread_id) || [];
      
      // Delete in correct order (respecting foreign keys)
      if (postIds.length > 0) {
        await supabaseAdmin.from('post_comments').delete().in('post_id', postIds);
        await supabaseAdmin.from('post_likes').delete().in('post_id', postIds);
      }
      if (threadIds.length > 0) {
        await supabaseAdmin.from('dm_messages').delete().in('thread_id', threadIds);
        await supabaseAdmin.from('dm_thread_members').delete().in('thread_id', threadIds);
        await supabaseAdmin.from('dm_threads').delete().in('id', threadIds);
      }
      // Get demo yap comment IDs for deleting related votes
      const { data: demoYapComments } = await supabaseAdmin
        .from('yap_comments')
        .select('id')
        .eq('is_demo', true);
      const yapCommentIds = demoYapComments?.map(c => c.id) || [];
      
      if (yapCommentIds.length > 0) {
        await supabaseAdmin.from('yap_comment_votes').delete().in('comment_id', yapCommentIds);
      }
      await supabaseAdmin.from('yap_comments').delete().eq('is_demo', true);
      await supabaseAdmin.from('yap_votes').delete().eq('is_demo', true);
      await supabaseAdmin.from('yap_messages').delete().eq('is_demo', true);
      await supabaseAdmin.from('venue_buzz_messages').delete().eq('is_demo', true);
      await supabaseAdmin.from('story_views').delete().eq('is_demo', true);
      await supabaseAdmin.from('stories').delete().eq('is_demo', true);
      await supabaseAdmin.from('posts').delete().eq('is_demo', true);
      await supabaseAdmin.from('checkins').delete().eq('is_demo', true);
      await supabaseAdmin.from('night_statuses').delete().eq('is_demo', true);
      
      // Delete venue reviews (via demo user IDs since no is_demo column)
      if (demoIds.length > 0) {
        // First get review IDs to delete related votes
        const { data: demoReviews } = await supabaseAdmin
          .from('venue_reviews')
          .select('id')
          .in('user_id', demoIds);
        const reviewIds = demoReviews?.map(r => r.id) || [];
        
        if (reviewIds.length > 0) {
          await supabaseAdmin.from('review_votes').delete().in('review_id', reviewIds);
        }
        await supabaseAdmin.from('venue_reviews').delete().in('user_id', demoIds);
      }
      
      await supabaseAdmin.from('venues').delete().eq('is_demo', true);
      if (demoIds.length > 0) {
        await supabaseAdmin.from('close_friends').delete().in('user_id', demoIds);
        await supabaseAdmin.from('close_friends').delete().in('close_friend_id', demoIds);
        await supabaseAdmin.from('friendships').delete().in('user_id', demoIds);
        await supabaseAdmin.from('friendships').delete().in('friend_id', demoIds);
      }
      await supabaseAdmin.from('profiles').delete().eq('is_demo', true);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
