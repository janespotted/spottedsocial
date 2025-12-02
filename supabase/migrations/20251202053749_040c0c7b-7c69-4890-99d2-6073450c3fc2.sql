-- Delete duplicate demo profiles, keeping only the first (oldest) one for each display_name
DELETE FROM profiles
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY display_name ORDER BY created_at ASC) as rn
    FROM profiles
    WHERE is_demo = true
  ) ranked
  WHERE rn > 1
);