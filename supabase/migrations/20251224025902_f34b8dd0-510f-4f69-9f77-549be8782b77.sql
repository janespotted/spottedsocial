-- Create function to find multiple nearby venues
CREATE OR REPLACE FUNCTION public.find_nearby_venues(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer DEFAULT 500,
  max_results integer DEFAULT 10
)
RETURNS TABLE(venue_id uuid, venue_name text, distance_meters double precision)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    (
      6371000 * acos(
        cos(radians(user_lat)) * cos(radians(v.lat)) * 
        cos(radians(v.lng) - radians(user_lng)) + 
        sin(radians(user_lat)) * sin(radians(v.lat))
      )
    ) as distance
  FROM venues v
  WHERE (
    6371000 * acos(
      cos(radians(user_lat)) * cos(radians(v.lat)) * 
      cos(radians(v.lng) - radians(user_lng)) + 
      sin(radians(user_lat)) * sin(radians(v.lat))
    )
  ) <= radius_meters
  ORDER BY distance
  LIMIT max_results;
END;
$$;