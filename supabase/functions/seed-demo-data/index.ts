import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Real NYC top-tier venues (scraped from top rankings)
const PROMOTED_VENUES = [
  { name: "Superbueno", lat: 40.7249, lng: -73.9865 },
  { name: "Sunken Harbor Club", lat: 40.6923, lng: -73.9872 },
  { name: "Bar Snack", lat: 40.7258, lng: -73.9874 },
  { name: "Attaboy", lat: 40.7185, lng: -73.9885 },
  { name: "schmuck.", lat: 40.7251, lng: -73.9863 },
  { name: "Saint Tuesday", lat: 40.7169, lng: -73.9982 },
  { name: "The Dead Rabbit", lat: 40.7040, lng: -74.0124 },
  { name: "Sunn's", lat: 40.7161, lng: -73.9977 },
  { name: "The Mulberry", lat: 40.7221, lng: -73.9951 },
  { name: "Amber Room", lat: 40.7198, lng: -73.9891 },
  { name: "Patent Pending", lat: 40.7234, lng: -73.9914 },
  { name: "Double Chicken Please", lat: 40.7195, lng: -73.9921 },
  { name: "Dante NYC", lat: 40.7310, lng: -74.0029 },
  { name: "Ketchy Shuby", lat: 40.7231, lng: -73.9969 },
  { name: "Gospël", lat: 40.7241, lng: -73.9977 },
  { name: "Jean's", lat: 40.7251, lng: -73.9988 },
  { name: "The Box", lat: 40.7216, lng: -73.9935 },
  { name: "Paul's Casablanca", lat: 40.7235, lng: -73.9969 },
  { name: "Paul's Cocktail Lounge", lat: 40.7171, lng: -74.0089 },
  { name: "The Nines", lat: 40.7268, lng: -73.9945 },
  { name: "Little Sister Lounge", lat: 40.7267, lng: -73.9857 },
  { name: "Le Bain", lat: 40.7414, lng: -74.0078 },
  { name: "Schimanski", lat: 40.7089, lng: -73.9332 },
  { name: "Public Hotel Rooftop", lat: 40.7252, lng: -73.9881 },
  { name: "Unveiled", lat: 40.7106, lng: -73.9638 },
  { name: "Studio Maison Nur", lat: 40.6844, lng: -73.9529 },
  { name: "House of Yes", lat: 40.7089, lng: -73.9332 },
  { name: "Elsewhere", lat: 40.7067, lng: -73.9278 },
  { name: "Nowadays", lat: 40.7067, lng: -73.9278 },
  { name: "Good Room", lat: 40.7089, lng: -73.9343 },
  { name: "TBA Brooklyn", lat: 40.7234, lng: -73.9567 },
  { name: "PHD Rooftop", lat: 40.7614, lng: -73.9776 },
  { name: "230 Fifth", lat: 40.7448, lng: -73.9873 },
  { name: "The Campbell", lat: 40.7527, lng: -73.9772 },
];

// Non-promoted demo venues (only for full demo mode)
const DEMO_VENUES = [
  { name: 'Silo', lat: 40.7489, lng: -73.9680 },
  { name: 'Output', lat: 40.7234, lng: -73.9567 },
  { name: 'Marquee New York', lat: 40.7412, lng: -73.9971 },
  { name: 'Lavo NYC', lat: 40.7584, lng: -73.9701 },
  { name: 'Tao Downtown', lat: 40.7403, lng: -74.0068 },
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
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1519167758481-83f29da8a97e?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1504309092620-4d0ec726efa4?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=800&fit=crop",
];

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

      // 4. Create night statuses with promoted venues
      const numActiveUsers = 12 + Math.floor(Math.random() * 5);  // More users for promoted venues
      const activeUsers = getRandomItems(demoUserIds, numActiveUsers);

      for (const userId of activeUsers) {
        // 75% chance to use promoted venue, 25% regular demo venue
        const usePromoted = Math.random() < 0.75;
        const venue = usePromoted 
          ? PROMOTED_VENUES[Math.floor(Math.random() * PROMOTED_VENUES.length)]
          : DEMO_VENUES[Math.floor(Math.random() * DEMO_VENUES.length)];
          
        await supabaseAdmin.from('night_statuses').insert({
          user_id: userId,
          status: 'out',
          venue_name: venue.name,
          lat: venue.lat,
          lng: venue.lng,
          expires_at: calculateExpiryTime(),
          updated_at: getRecentTimestamp(),
          is_demo: true,
          is_promoted: usePromoted,
        });
      }

      // 5. Create check-ins with promoted venues
      const checkins = [];
      for (const userId of activeUsers) {
        const numCheckins = 2 + Math.floor(Math.random() * 3);
        const usePromoted = Math.random() < 0.75;
        const venuePool = usePromoted ? PROMOTED_VENUES : DEMO_VENUES;
        const venues = getRandomItems(venuePool, numCheckins);

        for (const venue of venues) {
          checkins.push({
            user_id: userId,
            venue_name: venue.name,
            lat: venue.lat,
            lng: venue.lng,
            created_at: getRecentTimestamp(),
            is_demo: true,
            is_promoted: usePromoted,
          });
        }
      }

      await supabaseAdmin.from('checkins').insert(checkins);

      // 6. Create posts with promoted venues
      const posts = [];
      for (let i = 0; i < 60; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const usePromoted = Math.random() < 0.75;
        const venuePool = usePromoted ? PROMOTED_VENUES : DEMO_VENUES;
        const venue = venuePool[Math.floor(Math.random() * venuePool.length)];
        const caption = DEMO_CAPTIONS[Math.floor(Math.random() * DEMO_CAPTIONS.length)];
        
        // 60% of posts have images
        const hasImage = Math.random() < 0.6;
        const imageUrl = hasImage ? DEMO_POST_IMAGES[Math.floor(Math.random() * DEMO_POST_IMAGES.length)] : null;

        posts.push({
          user_id: userId,
          text: caption,
          image_url: imageUrl,
          venue_name: venue.name,
          expires_at: calculateExpiryTime(),
          created_at: getRecentTimestamp(4),
          is_demo: true,
          is_promoted: usePromoted,
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
      const hottestVenues = getRandomItems([...PROMOTED_VENUES, ...DEMO_VENUES], 10);
      const yapMessages = [];

      for (let i = 0; i < 40; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = hottestVenues[i % hottestVenues.length];
        const yapData = DEMO_YAP_MESSAGES[i % DEMO_YAP_MESSAGES.length];
        const isPromotedVenue = PROMOTED_VENUES.some(v => v.name === venue.name);
        
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
      await supabaseAdmin.from('yap_messages').insert(yapMessages);

      // 8. Create stories for demo users
      const storyUsers = getRandomItems(demoUserIds, 15); // 15 users with stories
      const stories = [];
      const storyVenues = getRandomItems([...PROMOTED_VENUES, ...DEMO_VENUES], 10);
      
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

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            users: demoUserIds.length,
            posts: 60,
            stories: stories.length,
            yaps: yapMessages.length,
            venues: PROMOTED_VENUES.length + DEMO_VENUES.length,
            activeUsers: activeUsers.length,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'clear') {
      await supabaseAdmin.from('post_comments').delete().eq('post_id', '').in('post_id',
        (await supabaseAdmin.from('posts').select('id').eq('is_demo', true)).data?.map(p => p.id) || []
      );
      await supabaseAdmin.from('stories').delete().eq('is_demo', true);
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
