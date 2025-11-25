-- Add venue_id foreign keys and update schema for location-based actions

-- Add venue_id to posts table
ALTER TABLE posts ADD COLUMN venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;

-- Add venue_id to checkins table
ALTER TABLE checkins ADD COLUMN venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;

-- Add venue_id to night_statuses table
ALTER TABLE night_statuses ADD COLUMN venue_id uuid REFERENCES venues(id) ON DELETE SET NULL;

-- Create index for faster venue lookups
CREATE INDEX idx_posts_venue_id ON posts(venue_id);
CREATE INDEX idx_checkins_venue_id ON checkins(venue_id);
CREATE INDEX idx_night_statuses_venue_id ON night_statuses(venue_id);

-- Create a function to find nearest venue within radius
CREATE OR REPLACE FUNCTION find_nearest_venue(
  user_lat double precision,
  user_lng double precision,
  radius_meters integer DEFAULT 200
)
RETURNS TABLE(venue_id uuid, venue_name text, distance_meters double precision) AS $$
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
$$ LANGUAGE plpgsql STABLE;