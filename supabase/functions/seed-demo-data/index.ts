import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const DEMO_VENUES = [
  { name: 'Le Bain', lat: 40.7414, lng: -74.0078 },
  { name: 'Silo', lat: 40.7489, lng: -73.9680 },
  { name: 'Attaboy', lat: 40.7217, lng: -73.9876 },
  { name: 'The Box', lat: 40.7223, lng: -73.9934 },
  { name: 'House of Yes', lat: 40.7089, lng: -73.9332 },
  { name: 'Elsewhere', lat: 40.7067, lng: -73.9278 },
  { name: 'Output', lat: 40.7234, lng: -73.9567 },
  { name: 'Marquee', lat: 40.7489, lng: -73.9921 },
  { name: 'Brooklyn Mirage', lat: 40.7158, lng: -73.9289 },
  { name: 'Good Room', lat: 40.7089, lng: -73.9425 },
  { name: 'Unter', lat: 40.7156, lng: -73.9567 },
  { name: 'Public Records', lat: 40.7045, lng: -73.9378 },
  { name: 'Mood Ring', lat: 40.7123, lng: -73.9234 },
  { name: 'Nowadays', lat: 40.7089, lng: -73.9445 },
  { name: 'Knockdown Center', lat: 40.7267, lng: -73.9123 },
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

const DEMO_YAP_MESSAGES = [
  "Anyone here? Looking for my friends 👀",
  "This DJ set is unreal!!!",
  "Line is crazy long outside",
  "Just got here, who's around?",
  "The energy is INSANE right now",
  "Best spot in Brooklyn hands down",
  "Dance floor is PACKED",
  "Where's the after party at?",
  "This place never disappoints",
  "Lost my friend, if you see them tell them I'm by the bar",
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

    const { action } = await req.json();

    if (action === 'seed') {
      const demoUserIds: string[] = [];

      // 1. Create demo profiles
      console.log('Creating 20 demo users...');
      for (let i = 0; i < DEMO_USERS.length; i++) {
        const demoUser = DEMO_USERS[i];
        const userId = crypto.randomUUID();
        demoUserIds.push(userId);

        const { error } = await supabaseAdmin.from('profiles').insert({
          id: userId,
          display_name: demoUser.display_name,
          username: `${demoUser.username}_${i}`,
          avatar_url: demoUser.avatar_url,
          bio: demoUser.bio,
          is_demo: true,
        });

        if (error) {
          console.error(`Error creating demo user ${i}:`, error);
          throw error;
        }
      }

      // 2. Create friendships with current user
      const currentUserFriendships = demoUserIds.map(demoUserId => ({
        user_id: user.id,
        friend_id: demoUserId,
        status: 'accepted',
      }));

      await supabaseAdmin.from('friendships').insert(currentUserFriendships);

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

      // 4. Create night statuses
      const numActiveUsers = 8 + Math.floor(Math.random() * 3);
      const activeUsers = getRandomItems(demoUserIds, numActiveUsers);

      for (const userId of activeUsers) {
        const venue = DEMO_VENUES[Math.floor(Math.random() * DEMO_VENUES.length)];
        await supabaseAdmin.from('night_statuses').insert({
          user_id: userId,
          status: 'out',
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(),
          is_demo: true,
        });
      }

      // 5. Create check-ins
      const checkins = [];
      for (const userId of activeUsers) {
        const numCheckins = 1 + Math.floor(Math.random() * 3);
        const venues = getRandomItems(DEMO_VENUES, numCheckins);

        for (const venue of venues) {
          checkins.push({
            user_id: userId,
            venue_name: venue.name,
            lat: venue.lat,
            lng: venue.lng,
            created_at: getRecentTimestamp(),
            is_demo: true,
          });
        }
      }
      await supabaseAdmin.from('checkins').insert(checkins);

      // 6. Create posts
      const posts = [];
      for (let i = 0; i < 50; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = DEMO_VENUES[Math.floor(Math.random() * DEMO_VENUES.length)];
        const caption = DEMO_CAPTIONS[Math.floor(Math.random() * DEMO_CAPTIONS.length)];

        posts.push({
          user_id: userId,
          text: caption,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(4),
          is_demo: true,
        });
      }
      await supabaseAdmin.from('posts').insert(posts);

      // 7. Create yap messages
      const hottestVenues = getRandomItems(DEMO_VENUES, 5);
      const yapMessages = [];

      for (let i = 0; i < 10; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = hottestVenues[i % hottestVenues.length];
        const message = DEMO_YAP_MESSAGES[Math.floor(Math.random() * DEMO_YAP_MESSAGES.length)];

        yapMessages.push({
          user_id: userId,
          text: message,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(2),
          is_anonymous: Math.random() > 0.3,
          is_demo: true,
        });
      }
      await supabaseAdmin.from('yap_messages').insert(yapMessages);

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            users: demoUserIds.length,
            posts: 50,
            yaps: 10,
            venues: DEMO_VENUES.length,
            activeUsers: activeUsers.length,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'clear') {
      await supabaseAdmin.from('posts').delete().eq('is_demo', true);
      await supabaseAdmin.from('checkins').delete().eq('is_demo', true);
      await supabaseAdmin.from('night_statuses').delete().eq('is_demo', true);
      await supabaseAdmin.from('yap_messages').delete().eq('is_demo', true);
      await supabaseAdmin.from('friendships').delete().eq('user_id', '').in('user_id', 
        (await supabaseAdmin.from('profiles').select('id').eq('is_demo', true)).data?.map(p => p.id) || []
      );
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
