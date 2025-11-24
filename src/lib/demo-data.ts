import { supabase } from '@/integrations/supabase/client';

// Real NYC top-tier venues (scraped from top NYC bar/club rankings 2025)
// These are "promoted" venues that appear in bootstrap mode (75% of leaderboard)
export const PROMOTED_VENUES = [
  // Top Bars
  { name: "Superbueno", lat: 40.7249, lng: -73.9865, neighborhood: "East Village", type: "bar" },
  { name: "Sunken Harbor Club", lat: 40.6923, lng: -73.9872, neighborhood: "Downtown Brooklyn", type: "bar" },
  { name: "Bar Snack", lat: 40.7258, lng: -73.9874, neighborhood: "East Village", type: "bar" },
  { name: "Attaboy", lat: 40.7185, lng: -73.9885, neighborhood: "Lower East Side", type: "bar" },
  { name: "schmuck.", lat: 40.7251, lng: -73.9863, neighborhood: "East Village", type: "bar" },
  { name: "Saint Tuesday", lat: 40.7169, lng: -73.9982, neighborhood: "Tribeca", type: "bar" },
  { name: "The Dead Rabbit", lat: 40.7040, lng: -74.0124, neighborhood: "Financial District", type: "bar" },
  { name: "Sunn's", lat: 40.7161, lng: -73.9977, neighborhood: "Chinatown", type: "bar" },
  
  // Top Clubs
  { name: "Ketchy Shuby", lat: 40.7231, lng: -73.9969, neighborhood: "SoHo", type: "club" },
  { name: "Gospël", lat: 40.7241, lng: -73.9977, neighborhood: "SoHo", type: "club" },
  { name: "Jean's", lat: 40.7251, lng: -73.9988, neighborhood: "Downtown", type: "club" },
  { name: "The Box", lat: 40.7216, lng: -73.9935, neighborhood: "Lower East Side", type: "club" },
  { name: "Paul's Casablanca", lat: 40.7235, lng: -73.9969, neighborhood: "SoHo", type: "club" },
  { name: "Paul's Cocktail Lounge", lat: 40.7171, lng: -74.0089, neighborhood: "Tribeca", type: "lounge" },
  { name: "The Mulberry", lat: 40.7221, lng: -73.9951, neighborhood: "Nolita", type: "bar" },
  { name: "The Nines", lat: 40.7268, lng: -73.9945, neighborhood: "NoHo", type: "lounge" },
  { name: "Unveiled", lat: 40.7106, lng: -73.9638, neighborhood: "Williamsburg", type: "club" },
  { name: "Little Sister Lounge", lat: 40.7267, lng: -73.9857, neighborhood: "East Village", type: "club" },
  { name: "Studio Maison Nur", lat: 40.6844, lng: -73.9529, neighborhood: "Brooklyn", type: "lounge" },
  { name: "Amber Room", lat: 40.7198, lng: -73.9891, neighborhood: "East Village", type: "bar" },
];

// Additional non-promoted demo venues (only appear when full demo mode is ON)
export const DEMO_VENUES = [
  { name: "Le Bain", lat: 40.7414, lng: -74.0078 },
  { name: "Silo", lat: 40.7489, lng: -73.9680 },
  { name: "House of Yes", lat: 40.7089, lng: -73.9332 },
  { name: "Elsewhere", lat: 40.7067, lng: -73.9278 },
  { name: "Output", lat: 40.7234, lng: -73.9567 },
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
  "Anyone here? Looking for my friends 👀",
  "This DJ set is unreal!!!",
  "Line is crazy long outside",
  "Just got here, who's around?",
  "The energy is INSANE right now",
  "Best spot in Brooklyn hands down",
  "Cover charge worth every penny",
  "Drinks are strong tonight 🍹",
  "Dance floor is PACKED",
  "Where's the after party at?",
  "This place never disappoints",
  "Someone buy me a drink? 😅",
  "Lost my friend, if you see them tell them I'm by the bar",
  "This is the most fun I've had in months",
  "Why is everyone so attractive here??",
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
