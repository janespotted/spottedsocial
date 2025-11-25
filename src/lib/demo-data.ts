import { supabase } from '@/integrations/supabase/client';

// Real NYC top-tier venues (scraped from top NYC bar/club rankings 2025)
// These are "promoted" venues that appear in bootstrap mode (75% of leaderboard)
export const PROMOTED_VENUES = [
  // Top Manhattan Bars
  { name: "Superbueno", lat: 40.7249, lng: -73.9865, neighborhood: "East Village", type: "bar" },
  { name: "Sunken Harbor Club", lat: 40.6923, lng: -73.9872, neighborhood: "Downtown Brooklyn", type: "bar" },
  { name: "Bar Snack", lat: 40.7258, lng: -73.9874, neighborhood: "East Village", type: "bar" },
  { name: "Attaboy", lat: 40.7185, lng: -73.9885, neighborhood: "Lower East Side", type: "bar" },
  { name: "schmuck.", lat: 40.7251, lng: -73.9863, neighborhood: "East Village", type: "bar" },
  { name: "Saint Tuesday", lat: 40.7169, lng: -73.9982, neighborhood: "Tribeca", type: "bar" },
  { name: "The Dead Rabbit", lat: 40.7040, lng: -74.0124, neighborhood: "Financial District", type: "bar" },
  { name: "Sunn's", lat: 40.7161, lng: -73.9977, neighborhood: "Chinatown", type: "bar" },
  { name: "The Mulberry", lat: 40.7221, lng: -73.9951, neighborhood: "Nolita", type: "bar" },
  { name: "Amber Room", lat: 40.7198, lng: -73.9891, neighborhood: "East Village", type: "bar" },
  { name: "Patent Pending", lat: 40.7234, lng: -73.9914, neighborhood: "Lower East Side", type: "bar" },
  { name: "Double Chicken Please", lat: 40.7195, lng: -73.9921, neighborhood: "Lower East Side", type: "bar" },
  { name: "Dante NYC", lat: 40.7310, lng: -74.0029, neighborhood: "West Village", type: "bar" },
  
  // Top Manhattan Clubs & Lounges
  { name: "Ketchy Shuby", lat: 40.7231, lng: -73.9969, neighborhood: "SoHo", type: "club" },
  { name: "Gospël", lat: 40.7241, lng: -73.9977, neighborhood: "SoHo", type: "club" },
  { name: "Jean's", lat: 40.7251, lng: -73.9988, neighborhood: "Downtown", type: "club" },
  { name: "The Box", lat: 40.7216, lng: -73.9935, neighborhood: "Lower East Side", type: "club" },
  { name: "Paul's Casablanca", lat: 40.7235, lng: -73.9969, neighborhood: "SoHo", type: "club" },
  { name: "Paul's Cocktail Lounge", lat: 40.7171, lng: -74.0089, neighborhood: "Tribeca", type: "lounge" },
  { name: "The Nines", lat: 40.7268, lng: -73.9945, neighborhood: "NoHo", type: "lounge" },
  { name: "Little Sister Lounge", lat: 40.7267, lng: -73.9857, neighborhood: "East Village", type: "club" },
  { name: "Le Bain", lat: 40.7414, lng: -74.0078, neighborhood: "Chelsea", type: "club" },
  { name: "Schimanski", lat: 40.7089, lng: -73.9332, neighborhood: "Williamsburg", type: "club" },
  { name: "Public Hotel Rooftop", lat: 40.7252, lng: -73.9881, neighborhood: "Lower East Side", type: "lounge" },
  
  // Brooklyn Hotspots
  { name: "Unveiled", lat: 40.7106, lng: -73.9638, neighborhood: "Williamsburg", type: "club" },
  { name: "Studio Maison Nur", lat: 40.6844, lng: -73.9529, neighborhood: "Brooklyn", type: "lounge" },
  { name: "House of Yes", lat: 40.7089, lng: -73.9332, neighborhood: "Bushwick", type: "club" },
  { name: "Elsewhere", lat: 40.7067, lng: -73.9278, neighborhood: "Bushwick", type: "club" },
  { name: "Nowadays", lat: 40.7067, lng: -73.9278, neighborhood: "Ridgewood", type: "club" },
  { name: "Good Room", lat: 40.7089, lng: -73.9343, neighborhood: "Greenpoint", type: "club" },
  { name: "TBA Brooklyn", lat: 40.7234, lng: -73.9567, neighborhood: "Williamsburg", type: "club" },
  
  // Midtown & Uptown
  { name: "PHD Rooftop", lat: 40.7614, lng: -73.9776, neighborhood: "Midtown", type: "lounge" },
  { name: "230 Fifth", lat: 40.7448, lng: -73.9873, neighborhood: "Flatiron", type: "rooftop" },
  { name: "The Campbell", lat: 40.7527, lng: -73.9772, neighborhood: "Grand Central", type: "bar" },
];

// Additional non-promoted demo venues (only appear when full demo mode is ON)
export const DEMO_VENUES = [
  { name: "Silo", lat: 40.7489, lng: -73.9680 },
  { name: "Output", lat: 40.7234, lng: -73.9567 },
  { name: "Marquee New York", lat: 40.7412, lng: -73.9971 },
  { name: "Lavo NYC", lat: 40.7584, lng: -73.9701 },
  { name: "Tao Downtown", lat: 40.7403, lng: -74.0068 },
];

export const DEMO_USERS = [
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

export const DEMO_CAPTIONS = [
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
  "Sound system is incredible 🔊",
  "Lost in the music rn",
  "Where has this place been all my life?",
  "Crowd is absolutely electric tonight ⚡",
  "This DJ knows what's up 👏",
  "Perfect way to end the week 🎉",
  "The lights + music + people = heaven",
  "Never leaving this dance floor",
  "Why is everyone here so good looking? 😍",
  "Bartender is a wizard 🍸",
  "Found my people 🙏",
  "If you're not here, you're missing out",
  "This is the spot tonight, trust me",
  "Vibing so hard I forgot what day it is",
  "New favorite Friday night ritual",
  "The after party starts here 👀",
  "Met the coolest people tonight",
  "This lineup is stacked 🎧",
  "Dance floor therapy in session 💃",
  "Can we just stay here forever?",
];

export const DEMO_YAP_MESSAGES = [
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

interface DemoModeState {
  enabled: boolean;
  seeded: boolean;
}

export function getDemoMode(): DemoModeState {
  const stored = localStorage.getItem('demo_mode');
  return stored ? JSON.parse(stored) : { enabled: false, seeded: false };
}

export function setDemoMode(enabled: boolean) {
  const current = getDemoMode();
  localStorage.setItem('demo_mode', JSON.stringify({ ...current, enabled }));
  // Emit custom event so components can react to demo mode changes
  window.dispatchEvent(new Event('demoModeChanged'));
}

export function markDemoSeeded() {
  const current = getDemoMode();
  localStorage.setItem('demo_mode', JSON.stringify({ ...current, seeded: true }));
  // Emit custom event so components can react to demo mode changes
  window.dispatchEvent(new Event('demoModeChanged'));
}

export async function clearDemoData() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seed-demo-data`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'clear' }),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to clear demo data');
    }
    
    // Reset seeded flag
    const current = getDemoMode();
    localStorage.setItem('demo_mode', JSON.stringify({ ...current, seeded: false }));
    window.dispatchEvent(new Event('demoModeChanged'));
    
    return { success: true };
  } catch (error) {
    console.error('Error clearing demo data:', error);
    return { success: false, error };
  }
}

// Helper to get random timestamp within last 4 hours
function getRecentTimestamp(hoursAgo: number = 4): string {
  const now = new Date();
  const randomMinutesAgo = Math.floor(Math.random() * hoursAgo * 60);
  const timestamp = new Date(now.getTime() - randomMinutesAgo * 60000);
  return timestamp.toISOString();
}

// Helper to get random items from array
function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

export async function seedDemoData(currentUserId: string) {
  try {
    console.log('🎬 Starting demo data seeding...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/seed-demo-data`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'seed' }),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to seed demo data');
    }

    markDemoSeeded();
    console.log('🎉 Demo data seeded successfully!');
    
    return { 
      success: true, 
      stats: result.stats,
    };
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    return { success: false, error };
  }
}
