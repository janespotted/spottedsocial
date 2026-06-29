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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!googleApiKey) {
      return new Response('Google API not configured', { status: 500, headers: corsHeaders });
    }

    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('google_photo_refs, google_place_id, name, lat, lng')
      .eq('id', venueId)
      .single();

    if (venueError || !venue) {
      return new Response('Venue not found', { status: 404, headers: corsHeaders });
    }

    // Try cached photo ref first
    let refs = venue.google_photo_refs as string[] | null;
    let photoRef = refs && Array.isArray(refs) && photoIndex < refs.length ? refs[photoIndex] : null;

    if (photoRef) {
      const result = await fetchPhoto(photoRef, googleApiKey);
      if (result) return result;
      console.log(`Cached ref expired for ${venue.name}, refreshing...`);
    }

    // Refresh: search for the venue and get fresh photo refs
    const freshRefs = await refreshPhotoRefs(venue.name, venue.lat, venue.lng, venue.google_place_id, googleApiKey);

    if (freshRefs && freshRefs.length > 0) {
      // Save fresh refs to DB
      await supabase.from('venues').update({ google_photo_refs: freshRefs }).eq('id', venueId);

      if (photoIndex < freshRefs.length) {
        const result = await fetchPhoto(freshRefs[photoIndex], googleApiKey);
        if (result) return result;
      }
    }

    return new Response('Photo unavailable', { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error('get-venue-photo error:', error);
    return new Response('Internal error', { status: 500, headers: corsHeaders });
  }
});

async function fetchPhoto(ref: string, apiKey: string): Promise<Response | null> {
  // Build Google Places Photo URL
  let photoUrl: string;
  if (ref.startsWith('http')) {
    // Legacy full URL
    try {
      const parsed = new URL(ref);
      const legacyRef = parsed.searchParams.get('photo_reference');
      photoUrl = legacyRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${legacyRef}&key=${apiKey}`
        : ref;
    } catch {
      photoUrl = ref;
    }
  } else if (ref.startsWith('places/')) {
    // New Places API format: places/{placeId}/photos/{photoRef}/media
    photoUrl = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`;
  } else {
    // Legacy photo_reference string
    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${apiKey}`;
  }

  try {
    const res = await fetch(photoUrl, { redirect: 'follow' });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const body = await res.arrayBuffer();

    return new Response(body, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return null;
  }
}

async function refreshPhotoRefs(
  name: string,
  lat: number | null,
  lng: number | null,
  placeId: string | null,
  apiKey: string,
): Promise<string[] | null> {
  try {
    // If we have a place_id, use Place Details directly (most reliable)
    if (placeId) {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
      const detailRes = await fetch(detailUrl);
      const detailData = await detailRes.json();
      if (detailData.result?.photos?.length) {
        return detailData.result.photos.slice(0, 10).map((p: any) => p.photo_reference);
      }
    }

    // Search by name + location
    const query = encodeURIComponent(name);
    let searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id,photos&key=${apiKey}`;
    if (lat && lng) searchUrl += `&locationbias=point:${lat},${lng}`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const candidate = searchData.candidates?.[0];
    if (candidate?.photos?.length) {
      return candidate.photos.slice(0, 10).map((p: any) => p.photo_reference);
    }

    // If Find Place returned a place_id but no photos, try Place Details
    if (candidate?.place_id) {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=photos&key=${apiKey}`;
      const detailRes = await fetch(detailUrl);
      const detailData = await detailRes.json();
      if (detailData.result?.photos?.length) {
        return detailData.result.photos.slice(0, 10).map((p: any) => p.photo_reference);
      }
    }

    return null;
  } catch (err) {
    console.error('refreshPhotoRefs error:', err);
    return null;
  }
}
