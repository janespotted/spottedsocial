-- Exclude demo users from mutual friend calculations.
-- Demo-seeded users should not create friend-of-friend connections
-- between real users. Only real (non-demo) intermediaries count.

-- 1. get_mutual_friend_ids: returns friends-of-friends for visibility expansion
--    Now excludes demo users as intermediaries AND from results
CREATE OR REPLACE FUNCTION public.get_mutual_friend_ids(p_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE
      WHEN f.user_id = p_user_id THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id)
      AND f.status = 'accepted'
  ),
  -- Only traverse through non-demo friends
  real_friends AS (
    SELECT mf.fid
    FROM my_friends mf
    JOIN profiles p ON p.id = mf.fid
    WHERE p.is_demo = false
  ),
  friends_of_friends AS (
    SELECT DISTINCT
      CASE
        WHEN f2.user_id = rf.fid THEN f2.friend_id
        ELSE f2.user_id
      END AS fof_id
    FROM friendships f2
    JOIN real_friends rf ON (f2.user_id = rf.fid OR f2.friend_id = rf.fid)
    WHERE f2.status = 'accepted'
  )
  SELECT fof.fof_id AS user_id
  FROM friends_of_friends fof
  -- Exclude self, direct friends, and demo users from results
  JOIN profiles p ON p.id = fof.fof_id
  WHERE fof.fof_id != p_user_id
    AND fof.fof_id NOT IN (SELECT fid FROM my_friends)
    AND p.is_demo = false;
END;
$$;

-- 2. is_mutual_friend: true if viewer and target share a non-demo common friend
CREATE OR REPLACE FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT friend_id AS fid FROM friendships
        WHERE user_id = viewer_id AND status = 'accepted'
      UNION
      SELECT user_id AS fid FROM friendships
        WHERE friend_id = viewer_id AND status = 'accepted'
    ) viewer_friends
    -- Only count non-demo intermediaries
    JOIN profiles p ON p.id = viewer_friends.fid AND p.is_demo = false
    WHERE viewer_friends.fid IN (
      SELECT friend_id FROM friendships
        WHERE user_id = target_user_id AND status = 'accepted'
      UNION
      SELECT user_id FROM friendships
        WHERE friend_id = target_user_id AND status = 'accepted'
    )
  )
$$;
