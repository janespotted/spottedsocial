import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const venueId = url.searchParams.get('venueId');
    const indexStr = url.searchParams.get('index') || '0';
    const photoIndex = parseInt(indexStr, 10);

    if (!venueId) {
      return new Response('Missing venueId', { status: 400, headers: corsHeaders });
    }

    if (isNaN(photoIndex) || photoIndex < 0 || photoIndex > 9) {
      return new Response('Invalid index', { status: 400, headers: corsHeaders });
    }

    // No auth required — venue photos are public data (venues table has public SELECT policy)
    // The API key is kept server-side which is the security concern, not access to the photos themselves

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('google_photo_refs')
      .eq('id', venueId)
      .single();

    if (venueError || !venue) {
      return new Response('Venue not found', { status: 404, headers: corsHeaders });
    }

    const refs = venue.google_photo_refs as string[] | null;
    if (!refs || !Array.isArray(refs) || photoIndex >= refs.length) {
      return new Response('Photo not found', { status: 404, headers: corsHeaders });
    }

    const photoRef = refs[photoIndex];
    if (!photoRef || typeof photoRef !== 'string') {
      return new Response('Invalid photo reference', { status: 404, headers: corsHeaders });
    }

    // If it's already a full URL (legacy data), extract photo_reference or just proxy it
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!googleApiKey) {
      return new Response('Google API not configured', { status: 500, headers: corsHeaders });
    }

    let googleUrl: string;
    if (photoRef.startsWith('http')) {
      // Legacy full URL — rebuild with current API key (the stored key may differ)
      try {
        const parsed = new URL(photoRef);
        const legacyRef = parsed.searchParams.get('photo_reference');
        if (legacyRef) {
          googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${legacyRef}&key=${googleApiKey}`;
        } else {
          googleUrl = photoRef; // Can't parse, try as-is
        }
      } catch {
        googleUrl = photoRef;
      }
    } else {
      // New format: raw photo_reference string
      googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${googleApiKey}`;
    }

    // Fetch image from Google
    const imageResponse = await fetch(googleUrl, { redirect: 'follow' });

    if (!imageResponse.ok) {
      console.error('Google photo fetch failed:', imageResponse.status);
      return new Response('Photo unavailable', { status: 404, headers: corsHeaders });
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const imageBody = await imageResponse.arrayBuffer();

    return new Response(imageBody, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('get-venue-photo error:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});
