-- Clean up duplicate demo profiles, keeping only the oldest one per display_name
DELETE FROM profiles
WHERE is_demo = true
AND id NOT IN (
  SELECT DISTINCT ON (display_name) id
  FROM profiles
  WHERE is_demo = true
  ORDER BY display_name, created_at ASC
);