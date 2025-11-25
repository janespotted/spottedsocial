-- Fix search_path for find_nearest_venue function
CREATE OR REPLACE FUNCTION find_nearest_venue(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer DEFAULT 200
)
RETURNS TABLE(venue_id uuid, venue_name text, distance_meters double precision) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = public
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
  LIMIT 1;
END;
$$;