import { supabase } from '@/integrations/supabase/client';
import { calculateExpiryTime } from './time-utils';

export const DEMO_VENUES = [
  { name: 'Le Bain', lat: 40.7414, lng: -74.0078 },
  { name: 'Silo', lat: 40.7489, lng: -73.9680 },
  { name: 'Attaboy', lat: 40.7217, lng: -73.9876 },
  { name: 'The Box', lat: 40.7223, lng: -73.9934 },
  { name: 'House of Yes', lat: 40.7089, lng: -73.9332 },
  { name: 'Elsewhere', lat: 40.7067, lng: -73.9278 },
  { name: 'Output', lat: 40.7234, lng: -73.9567 },
  { name: 'Marquee', lat: 40.7489, lng: -73.9921 },
];

export const DEMO_USERS = [
  { 
    display_name: 'Alex Rivera', 
    username: 'alex_spotted', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
    bio: 'NYC nightlife enthusiast 🌃'
  },
  { 
    display_name: 'Sam Chen', 
    username: 'samthenight', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam',
    bio: 'Always out, always vibing ✨'
  },
  { 
    display_name: 'Jordan Lee', 
    username: 'jordanspots', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
    bio: 'Finding the best spots in Brooklyn'
  },
  { 
    display_name: 'Taylor Kim', 
    username: 'taylornights', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Taylor',
    bio: 'Dance floor detective 💃'
  },
  { 
    display_name: 'Morgan Davis', 
    username: 'morganthemover', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Morgan',
    bio: 'Music lover | Late night explorer'
  },
  { 
    display_name: 'Casey Park', 
    username: 'caseygoesout', 
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Casey',
    bio: 'Living for the weekend 🎉'
  },
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
    // Delete demo posts
    await supabase.from('posts').delete().eq('is_demo', true);
    
    // Delete demo checkins
    await supabase.from('checkins').delete().eq('is_demo', true);
    
    // Delete demo night statuses
    await supabase.from('night_statuses').delete().eq('is_demo', true);
    
    // Delete demo yap messages
    await supabase.from('yap_messages').delete().eq('is_demo', true);
    
    // Delete demo profiles (this will cascade delete related data)
    await supabase.from('profiles').delete().eq('is_demo', true);
    
    // Reset seeded flag
    const current = getDemoMode();
    localStorage.setItem('demo_mode', JSON.stringify({ ...current, seeded: false }));
    // Emit custom event so components can react to demo mode changes
    window.dispatchEvent(new Event('demoModeChanged'));
    
    return { success: true };
  } catch (error) {
    console.error('Error clearing demo data:', error);
    return { success: false, error };
  }
}

export async function seedDemoData(currentUserId: string) {
  try {
    const demoUserIds: string[] = [];
    
    // 1. Create demo profiles
    for (const demoUser of DEMO_USERS) {
      const userId = `demo_${demoUser.username}_${Date.now()}_${Math.random()}`;
      demoUserIds.push(userId);
      
      await supabase.from('profiles').insert({
        id: userId,
        display_name: demoUser.display_name,
        username: demoUser.username,
        avatar_url: demoUser.avatar_url,
        bio: demoUser.bio,
        is_demo: true,
      });
    }

    // 2. Create friendships between current user and demo users
    for (const demoUserId of demoUserIds) {
      await supabase.from('friendships').insert({
        user_id: currentUserId,
        friend_id: demoUserId,
        status: 'accepted',
      });
    }

    // 3. Create demo night statuses (some users "out" at venues)
    const activeUsers = demoUserIds.slice(0, 4);
    for (let i = 0; i < activeUsers.length; i++) {
      const venue = DEMO_VENUES[i % DEMO_VENUES.length];
      await supabase.from('night_statuses').insert({
        user_id: activeUsers[i],
        status: 'out',
        venue_name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
        expires_at: calculateExpiryTime(),
        is_demo: true,
      });
    }

    // 4. Create demo checkins
    for (let i = 0; i < demoUserIds.length; i++) {
      const venue = DEMO_VENUES[i % DEMO_VENUES.length];
      await supabase.from('checkins').insert({
        user_id: demoUserIds[i],
        venue_name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
        is_demo: true,
      });
    }

    // 5. Create demo posts
    for (let i = 0; i < demoUserIds.length; i++) {
      const venue = DEMO_VENUES[i % DEMO_VENUES.length];
      const caption = DEMO_CAPTIONS[i % DEMO_CAPTIONS.length];
      
      await supabase.from('posts').insert({
        user_id: demoUserIds[i],
        text: caption,
        venue_name: venue.name,
        expires_at: calculateExpiryTime(),
        is_demo: true,
      });
    }

    // 6. Create demo yap messages
    for (let i = 0; i < Math.min(demoUserIds.length, 3); i++) {
      const venue = DEMO_VENUES[i];
      await supabase.from('yap_messages').insert({
        user_id: demoUserIds[i],
        text: `Anyone at ${venue.name} right now?`,
        venue_name: venue.name,
        expires_at: calculateExpiryTime(),
        is_anonymous: false,
        is_demo: true,
      });
    }

    markDemoSeeded();
    return { success: true, count: demoUserIds.length };
  } catch (error) {
    console.error('Error seeding demo data:', error);
    return { success: false, error };
  }
}
