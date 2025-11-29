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

      // 4. Insert all NYC venues into venues table first
      console.log('Inserting all 34 NYC venues...');
      const PROMOTED_VENUE_NAMES = ['Unveiled', 'Studio Maison Nur', 'Little Sister Lounge', 'Patent Pending'];
      
      const venuesToInsert = NYC_VENUES.map(v => ({
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        neighborhood: 'Manhattan', // Will be derived from coordinates in production
        type: 'nightclub',
        is_demo: true,
        is_promoted: PROMOTED_VENUE_NAMES.includes(v.name),
        popularity_rank: v.rank,
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
      const TOP_20_VENUES = NYC_VENUES.slice(0, 20); // Top 20 by popularity_rank
      const PROMOTED_VENUES = NYC_VENUES.filter(v => PROMOTED_VENUE_NAMES.includes(v.name));
      
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

      // 7. Create posts with promoted venues
      const posts = [];
      for (let i = 0; i < 60; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const usePromoted = Math.random() < 0.75;
        const venuePool = usePromoted ? NYC_VENUES : DEMO_VENUES;
        const venue = venuePool[Math.floor(Math.random() * venuePool.length)];
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
      const hottestVenues = getRandomItems([...NYC_VENUES, ...DEMO_VENUES], 10);
      const yapMessages = [];

      for (let i = 0; i < 40; i++) {
        const userId = demoUserIds[Math.floor(Math.random() * demoUserIds.length)];
        const venue = hottestVenues[i % hottestVenues.length];
        const yapData = DEMO_YAP_MESSAGES[i % DEMO_YAP_MESSAGES.length];
        const isPromotedVenue = NYC_VENUES.some((v: any) => v.name === venue.name);
        
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
      const storyVenues = getRandomItems([...NYC_VENUES, ...DEMO_VENUES], 10);
      
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

      // 9. Create demo message threads with current user
      console.log('Creating demo message threads...');
      const messageThreadUsers = getRandomItems(demoUserIds, 6); // 6 conversations
      
      // Match the screenshot exactly
      const threadConfigs = [
        { venue: "Le Bain", lastMessage: "Yeah I'm heading there now!", minutesAgo: 4, hasMultiple: true },
        { venue: "Employees Only", lastMessage: "Come it's popping off...", minutesAgo: 5, hasMultiple: false },
        { venue: "Employees Only", lastMessage: "See you soon!", minutesAgo: 10, hasMultiple: false },
        { venue: "Baby Grand", lastMessage: "Just got here!", minutesAgo: 12, hasMultiple: false },
        { venue: "Le Bain", lastMessage: "Where are you?", minutesAgo: 15, hasMultiple: true },
        { venue: "Le Bain", lastMessage: "This place is amazing!", minutesAgo: 20, hasMultiple: true },
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
        const venueData = NYC_VENUES.find((v: any) => v.name === config.venue) || NYC_VENUES[0];
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

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            users: demoUserIds.length,
            posts: 60,
            stories: stories.length,
            yaps: yapMessages.length,
            threads: threadCount,
            venues: NYC_VENUES.length + DEMO_VENUES.length,
            activeUsers: nightStatuses.length,
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
      await supabaseAdmin.from('story_views').delete().eq('is_demo', true);
      await supabaseAdmin.from('stories').delete().eq('is_demo', true);
      await supabaseAdmin.from('posts').delete().eq('is_demo', true);
      await supabaseAdmin.from('checkins').delete().eq('is_demo', true);
      await supabaseAdmin.from('night_statuses').delete().eq('is_demo', true);
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
