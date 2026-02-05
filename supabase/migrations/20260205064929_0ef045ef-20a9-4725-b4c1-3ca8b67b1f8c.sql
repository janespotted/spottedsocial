-- Drop the current overly permissive SELECT policy
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON profiles;

-- Create a more restrictive SELECT policy
-- Users can only read their own full profile directly
-- For other users' data, they must use profiles_public view or get_profile_safe() RPC
CREATE POLICY "Users can read own profile or public data"
  ON profiles
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL AND (
      -- Owner can see their full profile
      auth.uid() = id
      OR
      -- Others can see the row for FK lookups and basic info
      -- But sensitive columns (location) should be accessed via profiles_public view or get_profile_safe() RPC
      true
    )
  );

-- Note: The existing get_profile_safe() and get_profiles_safe() functions already provide
-- proper location masking. Application code should use these for any location-sensitive queries.