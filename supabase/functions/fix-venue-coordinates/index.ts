import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

    console.log(`Admin ${user.id} triggering fix-venue-coordinates`);

    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional parameters
    let batchSize = 10;
    let delayMs = 200;
    let limit = 300;
    try {
      const body = await req.json();
      if (body.batchSize) batchSize = body.batchSize;
      if (body.delayMs) delayMs = body.delayMs;
      if (body.limit) limit = body.limit;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Fetch all LA venues without google_place_id
    const { data: venues, error: fetchError } = await supabase
      .from('venues')
      .select('id, name, neighborhood, lat, lng')
      .eq('is_user_submitted', false)
      .is('google_place_id', null)
      .eq('city', 'la')
      .limit(limit);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch venues', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!venues || venues.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No venues to fix', updated: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${venues.length} venues in batches of ${batchSize}`);

    let updated = 0;
    let failed = 0;
    const failures: { name: string; reason: string }[] = [];

    // Process in batches
    for (let i = 0; i < venues.length; i += batchSize) {
      const batch = venues.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (venue) => {
          const searchInput = `${venue.name} ${venue.neighborhood} Los Angeles`;
          const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchInput)}&inputtype=textquery&fields=place_id,geometry&locationbias=circle:5000@${venue.lat},${venue.lng}&key=${googleApiKey}`;

          const resp = await fetch(findPlaceUrl);
          const data = await resp.json();

          if (data.status !== 'OK' || !data.candidates?.length) {
            throw new Error(`Not found: ${data.status}`);
          }

          const candidate = data.candidates[0];
          const newLat = candidate.geometry.location.lat;
          const newLng = candidate.geometry.location.lng;
          const placeId = candidate.place_id;

          const { error: updateError } = await supabase
            .from('venues')
            .update({
              lat: newLat,
              lng: newLng,
              google_place_id: placeId,
            })
            .eq('id', venue.id);

          if (updateError) throw new Error(updateError.message);

          return { name: venue.name, lat: newLat, lng: newLng };
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === 'fulfilled') {
          updated++;
        } else {
          failed++;
          failures.push({ name: batch[j].name, reason: result.reason?.message || 'Unknown' });
        }
      }

      // Delay between batches to avoid rate limits
      if (i + batchSize < venues.length) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    console.log(`Done: ${updated} updated, ${failed} failed`);

    return new Response(
      JSON.stringify({
        message: `Processed ${venues.length} venues`,
        updated,
        failed,
        failures: failures.slice(0, 20), // Cap failure details
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
