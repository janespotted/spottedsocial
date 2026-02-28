import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CITIES = ['nyc', 'la', 'pb'];
const EXPIRY_HOURS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // SECURITY: Require admin authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: hasAdmin, error: roleError } = await authClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (roleError || !hasAdmin) {
      console.error('Admin role check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} triggering refresh-leaderboard-energy`);

    const sb = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Delete expired demo night_statuses
    await sb.from('night_statuses').delete()
      .eq('is_demo', true)
      .lt('expires_at', new Date().toISOString());

    // 2. Fetch all demo user IDs
    const { data: demoProfiles } = await sb.from('profiles')
      .select('id')
      .eq('is_demo', true);

    if (!demoProfiles?.length) {
      return new Response(JSON.stringify({ success: true, message: 'No demo users found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const demoUserIds = demoProfiles.map((p: any) => p.id);
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 3600000).toISOString();
    const stats: Record<string, number> = {};

    for (const city of CITIES) {
      // 3. Fetch top 20 venues by popularity_rank for this city
      const { data: venues } = await sb.from('venues')
        .select('id, name, lat, lng, popularity_rank')
        .eq('city', city)
        .order('popularity_rank', { ascending: true })
        .limit(20);

      if (!venues?.length) continue;

      // 4. Delete existing demo night_statuses for demo users at these venues
      // (clean slate for this cycle)
      await sb.from('night_statuses').delete()
        .eq('is_demo', true)
        .in('venue_id', venues.map((v: any) => v.id));

      // 5. Randomize distribution: shuffle demo users, assign to venues
      // Each demo user can only have ONE night_status (unique on user_id)
      // So we distribute the 12 users across venues for this city
      
      // Shuffle users for randomness
      const shuffledUsers = [...demoUserIds].sort(() => 0.5 - Math.random());
      
      // Randomly decide how many venues get users (6-10 venues)
      const venueCount = Math.min(venues.length, 6 + Math.floor(Math.random() * 5));
      
      // Shuffle venues to randomize which ones get boosted
      const shuffledVenues = [...venues].sort(() => 0.5 - Math.random()).slice(0, venueCount);
      
      // Distribute users across selected venues
      // Give 2-4 users to the first venue (hot spot), 1-2 to others
      let userIndex = 0;
      const statuses: any[] = [];

      for (let i = 0; i < shuffledVenues.length && userIndex < shuffledUsers.length; i++) {
        const venue = shuffledVenues[i];
        // First 1-2 venues get more users, rest get 1
        const usersForVenue = i < 2 
          ? Math.min(3 + Math.floor(Math.random() * 2), shuffledUsers.length - userIndex) // 3-4
          : Math.min(1 + Math.floor(Math.random() * 2), shuffledUsers.length - userIndex); // 1-2

        for (let j = 0; j < usersForVenue && userIndex < shuffledUsers.length; j++) {
          statuses.push({
            user_id: shuffledUsers[userIndex],
            status: 'out',
            venue_id: venue.id,
            venue_name: venue.name,
            lat: venue.lat,
            lng: venue.lng,
            expires_at: expiresAt,
            is_demo: true,
          });
          userIndex++;
        }
      }

      if (statuses.length > 0) {
        // Use upsert since user_id is unique - each demo user gets reassigned
        const { error } = await sb.from('night_statuses').upsert(statuses, { onConflict: 'user_id' });
        if (error) console.error(`Error upserting statuses for ${city}:`, error);
      }

      stats[city] = statuses.length;
    }

    return new Response(JSON.stringify({ success: true, stats, expiresAt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('refresh-leaderboard-energy error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
