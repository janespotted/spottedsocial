-- Create a helper function that returns true if viewer is a direct friend OR a friend-of-friend
CREATE OR REPLACE FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_direct_friend(viewer_id, target_user_id) 
      OR public.is_mutual_friend(viewer_id, target_user_id)
$$;

-- Update posts RLS policy to use is_friend_or_mutual for mutual_friends visibility
DROP POLICY IF EXISTS "Posts viewable based on visibility" ON posts;
CREATE POLICY "Posts viewable based on visibility" ON posts
FOR SELECT USING (
  user_id = auth.uid()
  OR is_demo = true
  OR (
    CASE visibility
      WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
      WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
      WHEN 'mutual_friends' THEN public.is_friend_or_mutual(auth.uid(), user_id)
      ELSE false
    END
  )
);

-- Update stories RLS policy to use is_friend_or_mutual for mutual_friends visibility
DROP POLICY IF EXISTS "Stories viewable by friends based on visibility" ON stories;
CREATE POLICY "Stories viewable by friends based on visibility" ON stories
FOR SELECT USING (
  user_id = auth.uid()
  OR is_demo = true
  OR is_public_buzz = true
  OR (
    CASE visibility
      WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
      WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
      WHEN 'mutual_friends' THEN public.is_friend_or_mutual(auth.uid(), user_id)
      ELSE false
    END
  )
);

-- Update can_see_location function to use is_friend_or_mutual for mutual_friends
CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN viewer_id = target_user_id THEN true
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'close_friends' THEN
      public.is_close_friend(viewer_id, target_user_id)
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'all_friends' THEN
      public.is_direct_friend(viewer_id, target_user_id)
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'mutual_friends' THEN
      public.is_friend_or_mutual(viewer_id, target_user_id)
    ELSE false
  END
$$;