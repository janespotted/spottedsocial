-- Lock down relationship/visibility oracle RPCs so that authenticated callers
-- can only query with their own ID as viewer. Service-role / definer contexts
-- (where auth.uid() IS NULL) are still allowed, and all RLS policies pass
-- auth.uid() as viewer — so policy behavior is unchanged.

-- 1. can_see_location(viewer_id, target_user_id)
CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Auth-binding guard: authenticated users may only query as themselves.
  -- Service-role / definer contexts (auth.uid() IS NULL) are unrestricted.
  -- RLS policies always pass auth.uid() as viewer, so this is transparent.
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT CASE
      WHEN viewer_id = target_user_id THEN true
      WHEN EXISTS (
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
           OR (blocker_id = viewer_id AND blocked_id = target_user_id)
      ) THEN false
      WHEN EXISTS (
        SELECT 1 FROM location_hidden
        WHERE user_id = target_user_id AND hidden_from_id = viewer_id
      ) THEN false
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'close_friends' THEN
        public.is_close_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'all_friends' THEN
        public.is_direct_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'mutual_friends' THEN
        public.is_friend_or_mutual(viewer_id, target_user_id)
      ELSE false
    END
  );
END;
$$;

-- 2. is_direct_friend(viewer_id, target_user_id)
CREATE OR REPLACE FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND (
          (user_id = viewer_id AND friend_id = target_user_id)
          OR (user_id = target_user_id AND friend_id = viewer_id)
        )
    )
  );
END;
$$;

-- 3. is_close_friend(viewer_id, target_user_id)
CREATE OR REPLACE FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM close_friends
      WHERE user_id = target_user_id
        AND close_friend_id = viewer_id
    )
  );
END;
$$;

-- 4. is_mutual_friend(viewer_id, target_user_id)
CREATE OR REPLACE FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT friend_id AS fid FROM friendships
          WHERE user_id = viewer_id AND status = 'accepted'
        UNION
        SELECT user_id AS fid FROM friendships
          WHERE friend_id = viewer_id AND status = 'accepted'
      ) viewer_friends
      JOIN profiles p ON p.id = viewer_friends.fid AND p.is_demo = false
      WHERE viewer_friends.fid IN (
        SELECT friend_id FROM friendships
          WHERE user_id = target_user_id AND status = 'accepted'
        UNION
        SELECT user_id FROM friendships
          WHERE friend_id = target_user_id AND status = 'accepted'
      )
    )
  );
END;
$$;

-- 5. is_friend_or_mutual(viewer_id, target_user_id)
CREATE OR REPLACE FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public.is_direct_friend(viewer_id, target_user_id)
      OR public.is_mutual_friend(viewer_id, target_user_id);
END;
$$;

-- 6. get_mutual_friend_ids(p_user_id)
CREATE OR REPLACE FUNCTION public.get_mutual_friend_ids(p_user_id uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;  -- empty set
  END IF;

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
  JOIN profiles p ON p.id = fof.fof_id
  WHERE fof.fof_id != p_user_id
    AND fof.fof_id NOT IN (SELECT fid FROM my_friends)
    AND p.is_demo = false;
END;
$$;

-- Revoke anon access from all six functions (keep authenticated)
REVOKE ALL ON FUNCTION public.can_see_location(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_direct_friend(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_close_friend(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_mutual_friend(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_friend_or_mutual(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_mutual_friend_ids(uuid) FROM anon;
