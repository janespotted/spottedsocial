import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VenueHoursData {
  monday?: { open: string; close: string; is_overnight: boolean };
  tuesday?: { open: string; close: string; is_overnight: boolean };
  wednesday?: { open: string; close: string; is_overnight: boolean };
  thursday?: { open: string; close: string; is_overnight: boolean };
  friday?: { open: string; close: string; is_overnight: boolean };
  saturday?: { open: string; close: string; is_overnight: boolean };
  sunday?: { open: string; close: string; is_overnight: boolean };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venueId } = await req.json();
    
    if (!venueId) {
      return new Response(
        JSON.stringify({ error: 'venueId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!googleApiKey) {
      console.error('GOOGLE_PLACES_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Places API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch venue data
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('id, name, lat, lng, google_place_id, operating_hours, hours_last_updated, google_rating, google_user_ratings_total, google_photo_refs')
      .eq('id', venueId)
      .single();

    if (venueError || !venue) {
      console.error('Venue fetch error:', venueError);
      return new Response(
        JSON.stringify({ error: 'Venue not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we have recent cached data (less than 7 days old)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (venue.operating_hours && venue.hours_last_updated && 
        new Date(venue.hours_last_updated) > sevenDaysAgo) {
      console.log('Returning cached data for', venue.name);
      return new Response(
        JSON.stringify({ 
          success: true, 
          operating_hours: venue.operating_hours,
          google_rating: venue.google_rating,
          google_user_ratings_total: venue.google_user_ratings_total,
          google_photo_refs: venue.google_photo_refs,
          cached: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching fresh data for', venue.name);

    // Step 1: Get place_id if not cached
    let placeId = venue.google_place_id;
    if (!placeId) {
      const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(venue.name)}&inputtype=textquery&fields=place_id&locationbias=circle:100@${venue.lat},${venue.lng}&key=${googleApiKey}`;
      
      const findPlaceResponse = await fetch(findPlaceUrl);
      const findPlaceData = await findPlaceResponse.json();

      if (findPlaceData.status !== 'OK' || !findPlaceData.candidates?.length) {
        console.error('Place not found:', findPlaceData.status);
        return new Response(
          JSON.stringify({ error: 'Venue not found in Google Places' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      placeId = findPlaceData.candidates[0].place_id;
    }

    // Step 2: Get place details with opening hours, photos, and rating
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,photos,rating,user_ratings_total&key=${googleApiKey}`;
    
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    if (detailsData.status !== 'OK') {
      console.error('Place details error:', detailsData.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch venue details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = detailsData.result;
    const openingHours = result?.opening_hours?.periods;
    const photos = result?.photos || [];
    const rating = result?.rating;
    const userRatingsTotal = result?.user_ratings_total;

    // Build photo URLs from references (max 10)
    const photoUrls = photos.slice(0, 10).map((photo: any) => {
      return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${googleApiKey}`;
    });

    if (!openingHours) {
      console.log('No operating hours available for', venue.name);
      // Still update photos and rating even if no hours
      const { error: updateError } = await supabase
        .from('venues')
        .update({
          google_place_id: placeId,
          google_rating: rating || null,
          google_user_ratings_total: userRatingsTotal || null,
          google_photo_refs: photoUrls.length > 0 ? photoUrls : null,
          hours_last_updated: new Date().toISOString()
        })
        .eq('id', venueId);

      if (updateError) {
        console.error('Update error:', updateError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          operating_hours: null,
          google_rating: rating || null,
          google_user_ratings_total: userRatingsTotal || null,
          google_photo_refs: photoUrls.length > 0 ? photoUrls : null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Parse hours into our format
    const operatingHours: VenueHoursData = {};
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    for (const period of openingHours) {
      if (!period.open) continue;
      
      const dayName = dayNames[period.open.day];
      const openTime = period.open.time;
      const closeTime = period.close?.time || '2359';
      
      // Determine if overnight (closes next day or very early morning)
      const isOvernight = period.close?.day !== period.open.day || 
                         (parseInt(closeTime) < parseInt(openTime) && parseInt(closeTime) < 600);

      operatingHours[dayName as keyof VenueHoursData] = {
        open: `${openTime.slice(0, 2)}:${openTime.slice(2)}`,
        close: `${closeTime.slice(0, 2)}:${closeTime.slice(2)}`,
        is_overnight: isOvernight
      };
    }

    // Step 4: Update venue record with all data
    const { error: updateError } = await supabase
      .from('venues')
      .update({
        google_place_id: placeId,
        operating_hours: operatingHours,
        google_rating: rating || null,
        google_user_ratings_total: userRatingsTotal || null,
        google_photo_refs: photoUrls.length > 0 ? photoUrls : null,
        hours_last_updated: new Date().toISOString()
      })
      .eq('id', venueId);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    console.log('Successfully fetched and stored data for', venue.name);

    return new Response(
      JSON.stringify({ 
        success: true, 
        operating_hours: operatingHours,
        google_rating: rating || null,
        google_user_ratings_total: userRatingsTotal || null,
        google_photo_refs: photoUrls.length > 0 ? photoUrls : null,
        cached: false 
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
