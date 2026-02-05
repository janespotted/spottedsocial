import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Real NYC top-tier venues - Top 20 only
const NYC_VENUES = [
  { name: "Le Bain", lat: 40.7414, lng: -74.0078, rank: 1, neighborhood: "Meatpacking" },
  { name: "House of Yes", lat: 40.7089, lng: -73.9332, rank: 2, neighborhood: "Bushwick" },
  { name: "The Box", lat: 40.7216, lng: -73.9935, rank: 3, neighborhood: "Lower East Side" },
  { name: "Elsewhere", lat: 40.7067, lng: -73.9278, rank: 4, neighborhood: "Bushwick" },
  { name: "TBA Brooklyn", lat: 40.7234, lng: -73.9567, rank: 5, neighborhood: "Williamsburg" },
  { name: "Nowadays", lat: 40.7067, lng: -73.9278, rank: 6, neighborhood: "Ridgewood" },
  { name: "Double Chicken Please", lat: 40.7195, lng: -73.9921, rank: 7, neighborhood: "Lower East Side" },
  { name: "The Dead Rabbit", lat: 40.7040, lng: -74.0124, rank: 8, neighborhood: "Financial District" },
  { name: "Dante NYC", lat: 40.7310, lng: -74.0029, rank: 9, neighborhood: "West Village" },
  { name: "Attaboy", lat: 40.7185, lng: -73.9885, rank: 10, neighborhood: "Lower East Side" },
  { name: "PHD Rooftop", lat: 40.7614, lng: -73.9776, rank: 11, neighborhood: "Chelsea" },
  { name: "230 Fifth", lat: 40.7448, lng: -73.9873, rank: 12, neighborhood: "Flatiron" },
  { name: "Schimanski", lat: 40.7089, lng: -73.9332, rank: 13, neighborhood: "Williamsburg" },
  { name: "Good Room", lat: 40.7089, lng: -73.9343, rank: 14, neighborhood: "Greenpoint" },
  { name: "Superbueno", lat: 40.7249, lng: -73.9865, rank: 15, neighborhood: "East Village" },
  { name: "Sunken Harbor Club", lat: 40.6923, lng: -73.9872, rank: 16, neighborhood: "Carroll Gardens" },
  { name: "schmuck.", lat: 40.7251, lng: -73.9863, rank: 17, neighborhood: "East Village" },
  { name: "Public Hotel Rooftop", lat: 40.7252, lng: -73.9881, rank: 18, neighborhood: "Lower East Side" },
  { name: "Jean's", lat: 40.7251, lng: -73.9988, rank: 19, neighborhood: "SoHo" },
  { name: "The Campbell", lat: 40.7527, lng: -73.9772, rank: 20, neighborhood: "Midtown" },
];

// LA venues - Top 25 only
const LA_VENUES = [
  { name: "Academy LA", lat: 34.0479, lng: -118.2565, rank: 1, neighborhood: "Downtown LA" },
  { name: "Sound Nightclub", lat: 34.0412, lng: -118.2468, rank: 2, neighborhood: "Hollywood" },
  { name: "Exchange LA", lat: 34.0441, lng: -118.2504, rank: 3, neighborhood: "Downtown LA" },
  { name: "The Mayan", lat: 34.0493, lng: -118.2577, rank: 4, neighborhood: "Downtown LA" },
  { name: "Tenants of the Trees", lat: 34.0826, lng: -118.2690, rank: 5, neighborhood: "Silver Lake" },
  { name: "Catch One", lat: 34.0352, lng: -118.3085, rank: 6, neighborhood: "Mid-Wilshire" },
  { name: "Avalon Hollywood", lat: 34.1020, lng: -118.3268, rank: 7, neighborhood: "Hollywood" },
  { name: "The Echoplex", lat: 34.0775, lng: -118.2607, rank: 8, neighborhood: "Echo Park" },
  { name: "No Vacancy", lat: 34.0989, lng: -118.3267, rank: 9, neighborhood: "Hollywood" },
  { name: "Break Room 86", lat: 34.0781, lng: -118.3650, rank: 10, neighborhood: "Koreatown" },
  { name: "The Bungalow", lat: 34.0062, lng: -118.4715, rank: 11, neighborhood: "Santa Monica" },
  { name: "The Galley", lat: 34.0082, lng: -118.4889, rank: 12, neighborhood: "Santa Monica" },
  { name: "Finn McCool's", lat: 34.0057, lng: -118.4799, rank: 13, neighborhood: "Santa Monica" },
  { name: "The Basement Tavern", lat: 34.0134, lng: -118.4917, rank: 14, neighborhood: "Santa Monica" },
  { name: "The Roosterfish", lat: 33.9920, lng: -118.4715, rank: 15, neighborhood: "Venice" },
  { name: "The Townhouse & Del Monte Speakeasy", lat: 33.9934, lng: -118.4701, rank: 16, neighborhood: "Venice" },
  { name: "High Rooftop Lounge", lat: 33.9913, lng: -118.4660, rank: 17, neighborhood: "Venice" },
  { name: "Simmzy's Manhattan Beach", lat: 33.8846, lng: -118.4094, rank: 18, neighborhood: "Manhattan Beach" },
  { name: "Akbar", lat: 34.0894, lng: -118.2714, rank: 19, neighborhood: "Silver Lake" },
  { name: "The Short Stop", lat: 34.0782, lng: -118.2618, rank: 20, neighborhood: "Echo Park" },
  { name: "The Black Cat", lat: 34.0841, lng: -118.2689, rank: 21, neighborhood: "Silver Lake" },
  { name: "The Dresden", lat: 34.1055, lng: -118.2891, rank: 22, neighborhood: "Los Feliz" },
  { name: "Highland Park Bowl", lat: 34.1118, lng: -118.1924, rank: 23, neighborhood: "Highland Park" },
  { name: "EP & LP", lat: 34.0789, lng: -118.3661, rank: 24, neighborhood: "West Hollywood" },
  { name: "Warwick", lat: 34.1019, lng: -118.3277, rank: 25, neighborhood: "Hollywood" },
];

// Palm Beach venues - Top 15 only
const PB_VENUES = [
  { name: "Cucina", lat: 26.7056, lng: -80.0364, rank: 1, neighborhood: "Royal Poinciana Way", type: "restaurant" },
  { name: "HMF at The Breakers", lat: 26.7060, lng: -80.0341, rank: 2, neighborhood: "Palm Beach Island", type: "lounge" },
  { name: "Lola 41", lat: 26.7050, lng: -80.0378, rank: 3, neighborhood: "Worth Avenue", type: "restaurant" },
  { name: "Imoto", lat: 26.7055, lng: -80.0365, rank: 4, neighborhood: "Royal Poinciana Way", type: "lounge" },
  { name: "ER Bradley's Saloon", lat: 26.7153, lng: -80.0525, rank: 5, neighborhood: "Clematis Street", type: "bar" },
  { name: "Mary Lou's", lat: 26.7151, lng: -80.0530, rank: 6, neighborhood: "Clematis Street", type: "lounge" },
  { name: "Respectable Street", lat: 26.7140, lng: -80.0555, rank: 7, neighborhood: "Clematis Street", type: "club" },
  { name: "Roxy's Pub", lat: 26.7147, lng: -80.0542, rank: 8, neighborhood: "Clematis Street", type: "bar" },
  { name: "Clematis Social", lat: 26.7149, lng: -80.0535, rank: 9, neighborhood: "Clematis Street", type: "bar" },
  { name: "O'Shea's Irish Pub", lat: 26.7143, lng: -80.0550, rank: 10, neighborhood: "Clematis Street", type: "bar" },
  { name: "Rocco's Tacos", lat: 26.7148, lng: -80.0538, rank: 11, neighborhood: "Clematis Street", type: "bar" },
  { name: "Lost Weekend", lat: 26.7138, lng: -80.0558, rank: 12, neighborhood: "Clematis Street", type: "bar" },
  { name: "123 Datura", lat: 26.7130, lng: -80.0540, rank: 13, neighborhood: "Downtown WPB", type: "bar" },
  { name: "Four", lat: 26.7128, lng: -80.0538, rank: 14, neighborhood: "Downtown WPB", type: "lounge" },
  { name: "Blue Martini", lat: 26.7110, lng: -80.0623, rank: 15, neighborhood: "Rosemary Square", type: "lounge" },
];

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
];

const DEMO_REVIEW_IMAGES = [
  "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1587574293340-e0011c4e8ecf?w=600&h=400&fit=crop",
];

const DEMO_BUZZ_MESSAGES = [
  { text: "DJ is absolutely killing it right now 🔥", emoji_vibe: "🔥" },
  { text: "Line was long but SO worth it", emoji_vibe: "💃" },
  { text: "Best drinks in Brooklyn, hands down", emoji_vibe: "🍸" },
  { text: "The sound system here is insane", emoji_vibe: "🎵" },
  { text: "Crowd is perfect tonight ✨", emoji_vibe: "✨" },
  { text: "Just vibing", emoji_vibe: "💃" },
];

const DEMO_BUZZ_MEDIA = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&h=400&fit=crop",
  "https://images.unsplash.com/photo-1587574293340-e0011c4e8ecf?w=600&h=400&fit=crop",
];

const DEMO_PLAN_DESCRIPTIONS = [
  "Who's trying to go out tonight?",
  "Looking for a chill spot to start the night",
  "Birthday celebration! Come through 🎂",
  "Need a dance floor ASAP",
  "Pregaming at mine then hitting this place",
  "Heard the DJ tonight is insane",
  "Anyone down for a lowkey night?",
  "It's been too long, we're going OUT",
  "Rooftop vibes only 🌆",
  "Spontaneous night out, who's in?",
];

function getWeekendPlanDates(): string[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const dates: string[] = [];
  let daysUntilFriday: number;
  if (dayOfWeek === 0) { daysUntilFriday = -2; }
  else if (dayOfWeek === 6) { daysUntilFriday = -1; }
  else if (dayOfWeek === 5) { daysUntilFriday = 0; }
  else { daysUntilFriday = 5 - dayOfWeek; }
  for (let i = 0; i < 3; i++) {
    const planDate = new Date(today);
    planDate.setDate(today.getDate() + daysUntilFriday + i);
    dates.push(planDate.toISOString().split('T')[0]);
  }
  return dates;
}

// Condensed venue reviews - only for venues that exist in arrays
const VENUE_SPECIFIC_REVIEWS: Record<string, { reviews: Array<{ text: string | null; rating: number }> }> = {
  "Le Bain": { reviews: [{ text: "Rooftop views of the Hudson are incredible! Deep house vibes.", rating: 4 }, { text: "Great vibes but gets PACKED. Worth it for the Standard views.", rating: 3 }, { text: null, rating: 5 }] },
  "House of Yes": { reviews: [{ text: "Weird and wonderful! Aerial performances are mind-blowing.", rating: 5 }, { text: "Dress code is serious - costumes encouraged!", rating: 5 }, { text: null, rating: 5 }] },
  "The Box": { reviews: [{ text: "Most provocative performances in NYC. Not for the faint of heart.", rating: 5 }, { text: "Expensive but worth it. Theatrical performances are one of a kind.", rating: 4 }, { text: null, rating: 5 }] },
  "Elsewhere": { reviews: [{ text: "Three floors of different vibes! Best sound system in Brooklyn.", rating: 5 }, { text: "Zone One gets the best DJs. True techno temple.", rating: 5 }, { text: null, rating: 4 }] },
  "TBA Brooklyn": { reviews: [{ text: "Warehouse vibes with amazing sound. Real underground energy.", rating: 5 }, { text: "Gets some of the best techno acts in the city.", rating: 4 }, { text: null, rating: 5 }] },
  "Nowadays": { reviews: [{ text: "Outdoor space is HUGE! Perfect for summer day parties.", rating: 5 }, { text: "Best sound system for an outdoor venue.", rating: 4 }, { text: null, rating: 5 }] },
  "Double Chicken Please": { reviews: [{ text: "Ranked #2 bar in North America. Cocktails are literal art.", rating: 5 }, { text: "Best fried chicken sandwich and next level drinks.", rating: 5 }, { text: null, rating: 5 }] },
  "The Dead Rabbit": { reviews: [{ text: "Best Irish bar in America. Whiskey selection is unmatched.", rating: 5 }, { text: "Three floors of different vibes. Irish coffee is legendary.", rating: 5 }, { text: null, rating: 4 }] },
  "Dante NYC": { reviews: [{ text: "World's Best Bar vibes! Negronis here are perfection.", rating: 5 }, { text: "Garibaldi is incredible - fluffy orange juice with Campari.", rating: 5 }, { text: null, rating: 4 }] },
  "Attaboy": { reviews: [{ text: "No menu - tell them what you like and they'll make magic.", rating: 5 }, { text: "Speakeasy vibes done right. Zero pretension.", rating: 5 }, { text: null, rating: 4 }] },
  "PHD Rooftop": { reviews: [{ text: "Dream Hotel's crown jewel. Terrace views are stunning.", rating: 4 }, { text: "Perfect for special occasions. Dress up and enjoy.", rating: 4 }, { text: null, rating: 3 }] },
  "230 Fifth": { reviews: [{ text: "Biggest rooftop in NYC! Empire State Building views.", rating: 4 }, { text: "Come for the views, not the drinks.", rating: 3 }, { text: null, rating: 4 }] },
  "Schimanski": { reviews: [{ text: "Williamsburg's best club for serious techno and house.", rating: 5 }, { text: "Gets great international DJs.", rating: 4 }, { text: null, rating: 5 }] },
  "Good Room": { reviews: [{ text: "Two rooms, two vibes! Front for disco, back for deeper cuts.", rating: 5 }, { text: "Greenpoint's best kept secret.", rating: 5 }, { text: null, rating: 4 }] },
  "Superbueno": { reviews: [{ text: "East Village gem! Mezcal cocktails and late night dancing.", rating: 4 }, { text: "No cover, great drinks, and actual dancing.", rating: 5 }, { text: null, rating: 4 }] },
  "Sunken Harbor Club": { reviews: [{ text: "Tiki heaven in Carroll Gardens! Rum cocktails are legit.", rating: 5 }, { text: "Best tiki bar in Brooklyn.", rating: 5 }, { text: null, rating: 4 }] },
  "schmuck.": { reviews: [{ text: "Jewish deli meets cocktail bar and it works!", rating: 4 }, { text: "Late night pastrami sandwiches hit different.", rating: 4 }, { text: null, rating: 5 }] },
  "Public Hotel Rooftop": { reviews: [{ text: "Ian Schrager's latest. Views are gorgeous.", rating: 4 }, { text: "Beautiful space, pricey drinks, worth it.", rating: 4 }, { text: null, rating: 5 }] },
  "Jean's": { reviews: [{ text: "NoMad hotel's hidden gem. Feels like a Parisian salon.", rating: 5 }, { text: "Sophisticated without being stuffy.", rating: 4 }, { text: null, rating: 4 }] },
  "The Campbell": { reviews: [{ text: "Grand Central's secret! Jazz Age architecture is stunning.", rating: 5 }, { text: "Historic space with hand-painted ceiling.", rating: 5 }, { text: null, rating: 4 }] },
};

const LA_VENUE_SPECIFIC_REVIEWS: Record<string, { reviews: Array<{ text: string | null; rating: number }> }> = {
  "Academy LA": { reviews: [{ text: "Best sound system in LA! True underground vibe.", rating: 5 }, { text: "DTLA's premier techno spot.", rating: 4 }, { text: null, rating: 5 }] },
  "Sound Nightclub": { reviews: [{ text: "Massive club with incredible production.", rating: 4 }, { text: "Gets the biggest EDM acts.", rating: 4 }, { text: null, rating: 5 }] },
  "Exchange LA": { reviews: [{ text: "Old stock exchange building is stunning!", rating: 5 }, { text: "World-class DJs in a gorgeous space.", rating: 5 }, { text: null, rating: 4 }] },
  "The Mayan": { reviews: [{ text: "Mayan temple decor is wild!", rating: 4 }, { text: "Great Latin music nights.", rating: 4 }, { text: null, rating: 4 }] },
  "Tenants of the Trees": { reviews: [{ text: "Silver Lake's best kept secret! Killer DJs.", rating: 5 }, { text: "Tiki bar vibes mixed with warehouse techno.", rating: 5 }, { text: null, rating: 5 }] },
  "Catch One": { reviews: [{ text: "Historic venue with incredible energy.", rating: 5 }, { text: "Great programming across genres.", rating: 4 }, { text: null, rating: 5 }] },
  "Avalon Hollywood": { reviews: [{ text: "Classic Hollywood venue.", rating: 4 }, { text: "Gets great DJs.", rating: 4 }, { text: null, rating: 4 }] },
  "The Echoplex": { reviews: [{ text: "Best live music venue in Echo Park!", rating: 5 }, { text: "Seen some legendary shows here.", rating: 5 }, { text: null, rating: 4 }] },
  "No Vacancy": { reviews: [{ text: "Hidden entrance is so fun!", rating: 4 }, { text: "Speakeasy vibes in Hollywood.", rating: 4 }, { text: null, rating: 4 }] },
  "Break Room 86": { reviews: [{ text: "80s nostalgia done right!", rating: 4 }, { text: "Karaoke is a blast.", rating: 4 }, { text: null, rating: 4 }] },
  "The Bungalow": { reviews: [{ text: "Santa Monica beach vibes! Perfect day-to-night spot.", rating: 5 }, { text: "Feels like a beachside house party.", rating: 4 }, { text: null, rating: 5 }] },
  "The Galley": { reviews: [{ text: "Classic Santa Monica spot.", rating: 4 }, { text: "Good drinks, friendly crowd.", rating: 4 }, { text: null, rating: 4 }] },
  "Finn McCool's": { reviews: [{ text: "Great Irish pub near the beach.", rating: 4 }, { text: "Good for sports and cold beers.", rating: 4 }, { text: null, rating: 4 }] },
  "The Basement Tavern": { reviews: [{ text: "Solid Santa Monica bar.", rating: 4 }, { text: "Good vibes, decent drinks.", rating: 4 }, { text: null, rating: 4 }] },
  "The Roosterfish": { reviews: [{ text: "Venice institution!", rating: 4 }, { text: "Great community bar.", rating: 4 }, { text: null, rating: 4 }] },
  "The Townhouse & Del Monte Speakeasy": { reviews: [{ text: "Two bars in one! Speakeasy is great.", rating: 4 }, { text: "Venice landmark.", rating: 4 }, { text: null, rating: 4 }] },
  "High Rooftop Lounge": { reviews: [{ text: "Venice rooftop with great views.", rating: 4 }, { text: "Perfect for sunset drinks.", rating: 4 }, { text: null, rating: 4 }] },
  "Simmzy's Manhattan Beach": { reviews: [{ text: "Beach town vibes.", rating: 4 }, { text: "Good craft beer selection.", rating: 4 }, { text: null, rating: 4 }] },
  "Akbar": { reviews: [{ text: "Legendary Silver Lake bar! Karaoke nights are iconic.", rating: 5 }, { text: "Old school queer bar energy. No pretense.", rating: 5 }, { text: null, rating: 5 }] },
  "The Short Stop": { reviews: [{ text: "Echo Park institution! Cheap drinks, great DJ nights.", rating: 5 }, { text: "Dodgers games and hip hop.", rating: 4 }, { text: null, rating: 4 }] },
  "The Black Cat": { reviews: [{ text: "Historic Silver Lake bar with great cocktails.", rating: 4 }, { text: "Beautiful space with history.", rating: 4 }, { text: null, rating: 4 }] },
  "The Dresden": { reviews: [{ text: "Marty and Elayne are LA legends!", rating: 5 }, { text: "Old Hollywood glamour.", rating: 5 }, { text: null, rating: 4 }] },
  "Highland Park Bowl": { reviews: [{ text: "Bowling, pizza, and craft cocktails!", rating: 5 }, { text: "Historic space with modern touches.", rating: 4 }, { text: null, rating: 5 }] },
  "EP & LP": { reviews: [{ text: "Best rooftop bar in West Hollywood!", rating: 5 }, { text: "Great for sunset drinks.", rating: 4 }, { text: null, rating: 5 }] },
  "Warwick": { reviews: [{ text: "Hollywood club with good energy.", rating: 4 }, { text: "Gets busy on weekends.", rating: 4 }, { text: null, rating: 4 }] },
};

const PB_VENUE_SPECIFIC_REVIEWS: Record<string, { reviews: Array<{ text: string | null; rating: number }> }> = {
  "Cucina": { reviews: [{ text: "THE party spot on Palm Beach Island. DJ starts at 10pm!", rating: 5 }, { text: "Palm Beach's playground - dinner to dancing.", rating: 5 }, { text: null, rating: 5 }] },
  "HMF at The Breakers": { reviews: [{ text: "The Breakers' hidden gem. Upscale lounge vibes.", rating: 5 }, { text: "Best spot on the island.", rating: 4 }, { text: null, rating: 5 }] },
  "Lola 41": { reviews: [{ text: "Came for dinner, stayed for the DJ.", rating: 5 }, { text: "Worth Ave goes OFF after midnight.", rating: 5 }, { text: null, rating: 4 }] },
  "Imoto": { reviews: [{ text: "Late-night sushi and sake in the cutest space.", rating: 5 }, { text: "Great for starting the night.", rating: 4 }, { text: null, rating: 4 }] },
  "ER Bradley's Saloon": { reviews: [{ text: "The OG Clematis bar since 1995!", rating: 5 }, { text: "Real local vibes, great bands.", rating: 5 }, { text: null, rating: 4 }] },
  "Mary Lou's": { reviews: [{ text: "HOTTEST new spot in WPB. Dark, sultry, massive disco ball.", rating: 5 }, { text: "Finally a real nightlife spot downtown.", rating: 5 }, { text: null, rating: 5 }] },
  "Respectable Street": { reviews: [{ text: "LEGENDARY venue since the 80s!", rating: 5 }, { text: "Amazing live music scene.", rating: 5 }, { text: null, rating: 5 }] },
  "Roxy's Pub": { reviews: [{ text: "Best rooftop in downtown WPB!", rating: 5 }, { text: "Irish pub downstairs, rooftop party upstairs.", rating: 4 }, { text: null, rating: 4 }] },
  "Clematis Social": { reviews: [{ text: "Solid bar for starting the night.", rating: 4 }, { text: "Good drinks, friendly crowd.", rating: 4 }, { text: null, rating: 4 }] },
  "O'Shea's Irish Pub": { reviews: [{ text: "Classic Irish pub vibes!", rating: 4 }, { text: "Great for sports and cold beers.", rating: 4 }, { text: null, rating: 3 }] },
  "Rocco's Tacos": { reviews: [{ text: "Tableside guac is fire and margaritas hit HARD.", rating: 4 }, { text: "Gets rowdy late night.", rating: 4 }, { text: null, rating: 4 }] },
  "Lost Weekend": { reviews: [{ text: "Dive bar energy on Clematis!", rating: 4 }, { text: "Cheap drinks, no attitude.", rating: 4 }, { text: null, rating: 4 }] },
  "123 Datura": { reviews: [{ text: "Perfect neighborhood bar!", rating: 5 }, { text: "Craft cocktails and late night pizza.", rating: 5 }, { text: null, rating: 4 }] },
  "Four": { reviews: [{ text: "Best speakeasy in WPB! 23+ only.", rating: 5 }, { text: "Old NY cocktail bar vibes.", rating: 5 }, { text: null, rating: 5 }] },
  "Blue Martini": { reviews: [{ text: "The spot for the 30+ crowd!", rating: 5 }, { text: "Live music and dancing.", rating: 4 }, { text: null, rating: 5 }] },
};

const DEMO_YAP_MESSAGES = [
  { text: "Pretty sure Justin Bieber just walked in...", score: 78, comments: 5 },
  { text: "This music is awesome who's the DJ right now", score: 50, comments: 4 },
  { text: "What's everyone's move after close?", score: 5, comments: 3 },
  { text: "Anyone here? Looking for my friends 👀", score: 12, comments: 2 },
  { text: "This DJ set is unreal!!!", score: 67, comments: 6 },
  { text: "Line is crazy long outside", score: 23, comments: 3 },
  { text: "The energy is INSANE right now", score: 89, comments: 8 },
  { text: "Best spot in Brooklyn hands down", score: 42, comments: 4 },
  { text: "Where's the after party at?", score: 19, comments: 5 },
  { text: "Why is everyone so good looking here??", score: 93, comments: 9 },
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

// Helper to delete demo data by type
async function cleanupDemoData(supabaseAdmin: any, existingDemoIds: string[]) {
  if (existingDemoIds.length === 0) return;
  
  // DM threads
  const { data: demoThreads } = await supabaseAdmin.from('dm_thread_members').select('thread_id').in('user_id', existingDemoIds);
  const threadIds = [...new Set(demoThreads?.map((t: any) => t.thread_id) || [])];
  if (threadIds.length > 0) {
    await supabaseAdmin.from('dm_messages').delete().in('thread_id', threadIds);
    await supabaseAdmin.from('dm_thread_members').delete().in('thread_id', threadIds);
    await supabaseAdmin.from('dm_threads').delete().in('id', threadIds);
  }

  // Posts
  const { data: demoPosts } = await supabaseAdmin.from('posts').select('id').eq('is_demo', true);
  const postIds = demoPosts?.map((p: any) => p.id) || [];
  if (postIds.length > 0) {
    await supabaseAdmin.from('post_likes').delete().in('post_id', postIds);
    await supabaseAdmin.from('post_comments').delete().in('post_id', postIds);
  }
  await supabaseAdmin.from('posts').delete().eq('is_demo', true);

  // Yaps
  const { data: demoYaps } = await supabaseAdmin.from('yap_messages').select('id').eq('is_demo', true);
  const yapIds = demoYaps?.map((y: any) => y.id) || [];
  if (yapIds.length > 0) {
    const { data: demoYapComments } = await supabaseAdmin.from('yap_comments').select('id').eq('is_demo', true);
    const yapCommentIds = demoYapComments?.map((c: any) => c.id) || [];
    if (yapCommentIds.length > 0) {
      await supabaseAdmin.from('yap_comment_votes').delete().in('comment_id', yapCommentIds);
    }
    await supabaseAdmin.from('yap_comments').delete().eq('is_demo', true);
    await supabaseAdmin.from('yap_votes').delete().in('yap_id', yapIds);
  }
  await supabaseAdmin.from('yap_messages').delete().eq('is_demo', true);

  // Stories & Reviews
  await supabaseAdmin.from('story_views').delete().in('user_id', existingDemoIds);
  await supabaseAdmin.from('stories').delete().eq('is_demo', true);
  
  const { data: demoReviews } = await supabaseAdmin.from('venue_reviews').select('id').in('user_id', existingDemoIds);
  const reviewIds = demoReviews?.map((r: any) => r.id) || [];
  if (reviewIds.length > 0) {
    await supabaseAdmin.from('review_votes').delete().in('review_id', reviewIds);
  }
  await supabaseAdmin.from('venue_reviews').delete().in('user_id', existingDemoIds);

  // Location data
  await supabaseAdmin.from('checkins').delete().eq('is_demo', true);
  await supabaseAdmin.from('night_statuses').delete().eq('is_demo', true);

  // Friendships
  await supabaseAdmin.from('close_friends').delete().in('user_id', existingDemoIds);
  await supabaseAdmin.from('close_friends').delete().in('close_friend_id', existingDemoIds);
  await supabaseAdmin.from('friendships').delete().in('user_id', existingDemoIds);
  await supabaseAdmin.from('friendships').delete().in('friend_id', existingDemoIds);
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
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { action, city = 'nyc', userId } = await req.json();
    console.log(`Seed demo data called with action: ${action}, city: ${city}`);

    if (action === 'seed') {
      let SELECTED_VENUES: typeof NYC_VENUES;
      let SELECTED_REVIEWS: typeof VENUE_SPECIFIC_REVIEWS;
      
      if (city === 'la') {
        SELECTED_VENUES = LA_VENUES;
        SELECTED_REVIEWS = LA_VENUE_SPECIFIC_REVIEWS;
      } else if (city === 'pb') {
        SELECTED_VENUES = PB_VENUES;
        SELECTED_REVIEWS = PB_VENUE_SPECIFIC_REVIEWS;
      } else {
        SELECTED_VENUES = NYC_VENUES;
        SELECTED_REVIEWS = VENUE_SPECIFIC_REVIEWS;
      }
      
      // Cleanup existing demo data
      console.log('Cleaning up existing demo data...');
      const { data: existingDemoProfiles } = await supabaseAdmin.from('profiles').select('id').eq('is_demo', true);
      const existingDemoIds = existingDemoProfiles?.map((p: any) => p.id) || [];
      await cleanupDemoData(supabaseAdmin, existingDemoIds);
      await supabaseAdmin.from('venues').delete().eq('is_demo', true);
      await supabaseAdmin.from('notifications').delete().eq('is_demo', true);
      await supabaseAdmin.from('profiles').delete().eq('is_demo', true);
      
      // Delete demo plans
      const { data: demoPlansExisting } = await supabaseAdmin.from('plans').select('id').eq('is_demo', true);
      const planIdsExisting = demoPlansExisting?.map((p: any) => p.id) || [];
      if (planIdsExisting.length > 0) {
        await supabaseAdmin.from('plan_downs').delete().in('plan_id', planIdsExisting);
        await supabaseAdmin.from('plan_comments').delete().in('plan_id', planIdsExisting);
        await supabaseAdmin.from('plan_votes').delete().in('plan_id', planIdsExisting);
        await supabaseAdmin.from('plan_participants').delete().in('plan_id', planIdsExisting);
      }
      await supabaseAdmin.from('plans').delete().eq('is_demo', true);
      
      console.log('Cleanup complete. Starting fresh seed...');
      
      const demoUserIds: string[] = [];
      const DEMO_USER_COUNT = 30; // Reduced from 50

      // 1. Create demo profiles
      console.log('Creating demo users...');
      const timestamp = Date.now();
      for (let i = 0; i < DEMO_USER_COUNT; i++) {
        const demoUser = DEMO_USERS[i % DEMO_USERS.length];
        const newUserId = crypto.randomUUID();
        demoUserIds.push(newUserId);
        await supabaseAdmin.from('profiles').insert({
          id: newUserId,
          display_name: demoUser.display_name,
          username: `${demoUser.username}_${timestamp}_${i}`,
          avatar_url: demoUser.avatar_url,
          bio: demoUser.bio,
          is_demo: true,
        });
      }

      // 2. Friendships with real users
      const { data: realUsers } = await supabaseAdmin.from('profiles').select('id').eq('is_demo', false);
      const realUserIds = realUsers?.map((u: any) => u.id) || [];
      const allFriendships: Array<{ user_id: string; friend_id: string; status: string }> = [];
      for (const realUserId of realUserIds) {
        for (const demoUserId of demoUserIds) {
          allFriendships.push({ user_id: realUserId, friend_id: demoUserId, status: 'accepted' });
        }
      }
      if (allFriendships.length > 0) {
        await supabaseAdmin.from('friendships').insert(allFriendships);
      }

      // 3. Demo friendships
      const demoFriendships: Array<{ user_id: string; friend_id: string; status: string }> = [];
      for (let i = 0; i < demoUserIds.length; i++) {
        const friends = getRandomItems(demoUserIds.filter((_, idx) => idx !== i), 4);
        for (const friendId of friends) {
          if (!demoFriendships.some(f => (f.user_id === demoUserIds[i] && f.friend_id === friendId) || (f.user_id === friendId && f.friend_id === demoUserIds[i]))) {
            demoFriendships.push({ user_id: demoUserIds[i], friend_id: friendId, status: 'accepted' });
          }
        }
      }
      if (demoFriendships.length > 0) {
        await supabaseAdmin.from('friendships').insert(demoFriendships);
      }

      // 4. Insert venues
      console.log(`Inserting ${city.toUpperCase()} venues...`);
      const NYC_PROMOTED_NAMES = ['PHD Rooftop', '230 Fifth', 'Good Room'];
      const LA_PROMOTED_NAMES = ['Highland Park Bowl', 'The Dresden', 'EP & LP'];
      const PROMOTED_VENUE_NAMES = city === 'la' ? LA_PROMOTED_NAMES : NYC_PROMOTED_NAMES;
      
      const venuesToInsert = SELECTED_VENUES.map(v => ({
        name: v.name, lat: v.lat, lng: v.lng,
        neighborhood: (v as any).neighborhood || 'Unknown',
        type: (v as any).type || 'bar',
        is_demo: true,
        is_leaderboard_promoted: PROMOTED_VENUE_NAMES.includes(v.name),
        is_map_promoted: PROMOTED_VENUE_NAMES.includes(v.name),
        popularity_rank: v.rank,
        city: city,
      }));

      const { data: insertedVenues, error: venuesError } = await supabaseAdmin
        .from('venues')
        .upsert(venuesToInsert, { onConflict: 'name', ignoreDuplicates: false })
        .select('id, name');

      if (venuesError) throw venuesError;
      const venueIdMap = new Map(insertedVenues.map((v: any) => [v.name, v.id]));
      console.log(`Inserted ${insertedVenues.length} venues`);

      // 5. Night statuses
      console.log('Creating night statuses...');
      const nightStatuses = [];
      const PLANNING_NEIGHBORHOODS: Record<string, string[]> = {
        'la': ['West Hollywood', 'Hollywood', 'Venice', 'Santa Monica', 'Silver Lake'],
        'nyc': ['West Village', 'Lower East Side', 'SoHo', 'Williamsburg', 'East Village']
      };

      for (let i = 0; i < demoUserIds.length - 4; i++) {
        const venue = SELECTED_VENUES[i % SELECTED_VENUES.length];
        const venueId = venueIdMap.get(venue.name);
        nightStatuses.push({
          user_id: demoUserIds[i],
          status: 'out',
          venue_id: venueId,
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(2),
          is_demo: true,
        });
      }

      // Planning users
      for (let i = demoUserIds.length - 4; i < demoUserIds.length; i++) {
        const neighborhoods = PLANNING_NEIGHBORHOODS[city] || PLANNING_NEIGHBORHOODS['nyc'];
        nightStatuses.push({
          user_id: demoUserIds[i],
          status: 'planning',
          planning_neighborhood: neighborhoods[i % neighborhoods.length],
          planning_visibility: 'friends',
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(1),
          is_demo: true,
        });
      }

      if (nightStatuses.length > 0) {
        await supabaseAdmin.from('night_statuses').insert(nightStatuses);
      }

      // 6. Check-ins
      console.log('Creating check-ins...');
      const checkins = [];
      for (let i = 0; i < Math.min(15, demoUserIds.length); i++) {
        const venue = SELECTED_VENUES[i % SELECTED_VENUES.length];
        const venueId = venueIdMap.get(venue.name);
        checkins.push({
          user_id: demoUserIds[i],
          venue_id: venueId,
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          created_at: getRecentTimestamp(3),
          is_demo: true,
        });
      }
      if (checkins.length > 0) {
        await supabaseAdmin.from('checkins').insert(checkins);
      }

      // 7. Posts
      console.log('Creating demo posts...');
      const posts = [];
      for (let i = 0; i < 40; i++) {
        const postUserId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = SELECTED_VENUES[Math.floor(Math.random() * SELECTED_VENUES.length)];
        const venueId = venueIdMap.get(venue.name);
        const hasImage = Math.random() > 0.3;
        posts.push({
          user_id: postUserId,
          text: DEMO_CAPTIONS[Math.floor(Math.random() * DEMO_CAPTIONS.length)],
          venue_id: venueId,
          venue_name: venue.name,
          image_url: hasImage ? DEMO_POST_IMAGES[Math.floor(Math.random() * DEMO_POST_IMAGES.length)] : null,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(4),
          is_demo: true,
          visibility: 'friends',
        });
      }
      const { data: insertedPosts } = await supabaseAdmin.from('posts').insert(posts).select('id');

      // 8. Post likes
      const postLikes = [];
      for (const post of getRandomItems(insertedPosts || [], 25)) {
        const likers = getRandomItems(demoUserIds, 1 + Math.floor(Math.random() * 3));
        for (const likerId of likers) {
          postLikes.push({ post_id: post.id, user_id: likerId, created_at: getRecentTimestamp(2) });
        }
      }
      if (postLikes.length > 0) {
        await supabaseAdmin.from('post_likes').insert(postLikes);
      }

      // 9. Notifications
      if (userId) {
        const demoNotifications = [];
        const { data: demoProfilesForNotifs } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', demoUserIds.slice(0, 6));
        for (const profile of demoProfilesForNotifs || []) {
          demoNotifications.push({
            sender_id: profile.id,
            receiver_id: userId,
            type: 'post_like',
            message: `${profile.display_name} liked your post ❤️`,
            created_at: getRecentTimestamp(1),
            is_demo: true,
          });
        }
        if (demoNotifications.length > 0) {
          await supabaseAdmin.from('notifications').insert(demoNotifications);
        }
      }

      // 10. Yap messages
      console.log('Creating yap messages...');
      const yapMessages = [];
      for (let i = 0; i < 20; i++) {
        const yapUserId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = SELECTED_VENUES[i % SELECTED_VENUES.length];
        const yapData = DEMO_YAP_MESSAGES[i % DEMO_YAP_MESSAGES.length];
        yapMessages.push({
          user_id: yapUserId,
          text: yapData.text,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(2),
          is_anonymous: true,
          author_handle: `User${Math.floor(100000 + Math.random() * 900000)}`,
          score: yapData.score,
          comments_count: yapData.comments,
          is_demo: true,
        });
      }
      await supabaseAdmin.from('yap_messages').insert(yapMessages);

      // 11. Stories
      const stories = [];
      for (const storyUserId of getRandomItems(demoUserIds, 8)) {
        const venue = SELECTED_VENUES[Math.floor(Math.random() * SELECTED_VENUES.length)];
        stories.push({
          user_id: storyUserId,
          media_url: DEMO_POST_IMAGES[Math.floor(Math.random() * DEMO_POST_IMAGES.length)],
          media_type: 'image',
          venue_name: venue.name,
          created_at: getRecentTimestamp(8),
          expires_at: calculateExpiryTime(),
          is_demo: true,
        });
      }
      if (stories.length > 0) {
        await supabaseAdmin.from('stories').insert(stories);
      }

      // 12. Reviews
      console.log('Creating venue reviews...');
      const venueReviews = [];
      for (const venue of SELECTED_VENUES.slice(0, 15)) {
        const venueId = venueIdMap.get(venue.name);
        if (!venueId) continue;
        const venueReviewData = SELECTED_REVIEWS[venue.name];
        if (!venueReviewData) continue;
        const reviewers = getRandomItems(demoUserIds, venueReviewData.reviews.length);
        for (let i = 0; i < venueReviewData.reviews.length; i++) {
          const review = venueReviewData.reviews[i];
          venueReviews.push({
            venue_id: venueId,
            user_id: reviewers[i],
            rating: review.rating,
            review_text: review.text,
            is_anonymous: Math.random() < 0.3,
            image_url: Math.random() < 0.3 ? DEMO_REVIEW_IMAGES[Math.floor(Math.random() * DEMO_REVIEW_IMAGES.length)] : null,
            score: Math.floor(Math.random() * 15),
            created_at: getRecentTimestamp(168),
          });
        }
      }
      if (venueReviews.length > 0) {
        await supabaseAdmin.from('venue_reviews').insert(venueReviews);
      }

      // 13. Buzz messages
      const buzzMessages = [];
      for (const venue of SELECTED_VENUES.slice(0, 8)) {
        const venueId = venueIdMap.get(venue.name);
        if (!venueId) continue;
        for (let i = 0; i < 3; i++) {
          const buzz = DEMO_BUZZ_MESSAGES[Math.floor(Math.random() * DEMO_BUZZ_MESSAGES.length)];
          buzzMessages.push({
            user_id: demoUserIds[Math.floor(Math.random() * demoUserIds.length)],
            venue_id: venueId,
            venue_name: venue.name,
            text: buzz.text,
            emoji_vibe: buzz.emoji_vibe,
            is_anonymous: true,
            expires_at: calculateExpiryTime(),
            created_at: getRecentTimestamp(2),
            is_demo: true,
          });
        }
      }
      if (buzzMessages.length > 0) {
        await supabaseAdmin.from('venue_buzz_messages').insert(buzzMessages);
      }

      // 14. Plans
      console.log('Creating demo plans...');
      const weekendDates = getWeekendPlanDates();
      const planTimes = ['20:00', '21:00', '22:00', '23:00'];
      const demoPlans = [];
      const planCreators = getRandomItems(demoUserIds, 10);
      for (let i = 0; i < planCreators.length; i++) {
        const creatorId = planCreators[i];
        const venue = SELECTED_VENUES[Math.floor(Math.random() * Math.min(15, SELECTED_VENUES.length))];
        const venueId = venueIdMap.get(venue.name);
        const planDate = weekendDates[Math.floor(Math.random() * weekendDates.length)];
        const planTime = planTimes[Math.floor(Math.random() * planTimes.length)];
        const description = DEMO_PLAN_DESCRIPTIONS[Math.floor(Math.random() * DEMO_PLAN_DESCRIPTIONS.length)];
        const expiresAt = new Date(planDate + 'T05:00:00');
        expiresAt.setDate(expiresAt.getDate() + 1);
        demoPlans.push({
          user_id: creatorId,
          venue_id: venueId,
          venue_name: venue.name,
          plan_date: planDate,
          plan_time: planTime,
          description: description,
          visibility: Math.random() > 0.3 ? 'friends' : 'close_friends',
          expires_at: expiresAt.toISOString(),
          created_at: getRecentTimestamp(12),
          is_demo: true,
          score: 0,
          comments_count: 0,
        });
      }

      let plansCreated = 0;
      let planDownsCreated = 0;
      if (demoPlans.length > 0) {
        const { data: insertedPlans, error: plansError } = await supabaseAdmin.from('plans').insert(demoPlans).select('id, user_id');
        if (!plansError && insertedPlans) {
          plansCreated = insertedPlans.length;
          const planDowns = [];
          for (const plan of insertedPlans) {
            if (Math.random() < 0.6) {
              const downUsers = getRandomItems(demoUserIds.filter(id => id !== plan.user_id), 1 + Math.floor(Math.random() * 3));
              for (const downUserId of downUsers) {
                planDowns.push({ plan_id: plan.id, user_id: downUserId, created_at: getRecentTimestamp(6) });
              }
            }
          }
          if (planDowns.length > 0) {
            await supabaseAdmin.from('plan_downs').insert(planDowns);
            planDownsCreated = planDowns.length;
          }
        }
      }

      console.log('Seed complete!');
      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            users: demoUserIds.length,
            posts: posts.length,
            stories: stories.length,
            yaps: yapMessages.length,
            venues: SELECTED_VENUES.length,
            buzzMessages: buzzMessages.length,
            plans: plansCreated,
            planDowns: planDownsCreated,
            city: city,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'clear') {
      const { data: demoProfiles } = await supabaseAdmin.from('profiles').select('id').eq('is_demo', true);
      const demoIds = demoProfiles?.map((p: any) => p.id) || [];
      
      const { data: demoPosts } = await supabaseAdmin.from('posts').select('id').eq('is_demo', true);
      const postIds = demoPosts?.map((p: any) => p.id) || [];
      const { data: demoThreads } = await supabaseAdmin.from('dm_thread_members').select('thread_id').in('user_id', demoIds);
      const threadIds = demoThreads?.map((t: any) => t.thread_id) || [];
      
      if (postIds.length > 0) {
        await supabaseAdmin.from('post_comments').delete().in('post_id', postIds);
        await supabaseAdmin.from('post_likes').delete().in('post_id', postIds);
      }
      if (threadIds.length > 0) {
        await supabaseAdmin.from('dm_messages').delete().in('thread_id', threadIds);
        await supabaseAdmin.from('dm_thread_members').delete().in('thread_id', threadIds);
        await supabaseAdmin.from('dm_threads').delete().in('id', threadIds);
      }
      
      const { data: demoYapComments } = await supabaseAdmin.from('yap_comments').select('id').eq('is_demo', true);
      const yapCommentIds = demoYapComments?.map((c: any) => c.id) || [];
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
      
      const { data: demoPlansData } = await supabaseAdmin.from('plans').select('id').eq('is_demo', true);
      const planIds = demoPlansData?.map((p: any) => p.id) || [];
      if (planIds.length > 0) {
        await supabaseAdmin.from('plan_downs').delete().in('plan_id', planIds);
        await supabaseAdmin.from('plan_comments').delete().in('plan_id', planIds);
        await supabaseAdmin.from('plan_votes').delete().in('plan_id', planIds);
        await supabaseAdmin.from('plan_participants').delete().in('plan_id', planIds);
      }
      await supabaseAdmin.from('plans').delete().eq('is_demo', true);
      
      if (demoIds.length > 0) {
        const { data: demoReviews } = await supabaseAdmin.from('venue_reviews').select('id').in('user_id', demoIds);
        const reviewIds = demoReviews?.map((r: any) => r.id) || [];
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
      await supabaseAdmin.from('notifications').delete().eq('is_demo', true);
      await supabaseAdmin.from('profiles').delete().eq('is_demo', true);

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
