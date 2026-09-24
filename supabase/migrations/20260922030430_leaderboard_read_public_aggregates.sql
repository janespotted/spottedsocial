CREATE OR REPLACE FUNCTION public.get_venue_leaderboard(p_city text DEFAULT 'nyc'::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(venue_id uuid, name text, neighborhood text, venue_type text, lat double precision, lng double precision, google_rating numeric, google_user_ratings_total integer, internet_score numeric, checkin_score numeric, final_score numeric, unique_checkins_24h integer, unique_checkins_7d integer, trend_label text, source_count integer, computed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    v.id,
    v.name,
    v.neighborhood,
    v.type,
    v.lat,
    v.lng,
    v.google_rating,
    v.google_user_ratings_total,
    s.internet_score,
    s.checkin_score,
    s.final_score,
    s.unique_checkins_24h,
    s.unique_checkins_7d,
    s.trend_label,
    s.source_count,
    s.computed_at
  from public.venue_leaderboard_scores s
  join public.venues v on v.id = s.venue_id
  where s.city = p_city
    and coalesce(v.is_demo, false) = false
    and v.leaderboard_eligible
    -- Use the public aggregate; raw source events are private collector data.
    and (
      v.type in ('club','nightclub')
      or s.unique_checkins_7d > 0
      or s.source_count > 0
    )
  order by s.final_score desc, s.internet_score desc, v.name asc
  limit greatest(1, least(p_limit, 100));
$function$;
