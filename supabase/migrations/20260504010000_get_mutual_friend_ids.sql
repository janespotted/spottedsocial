-- Returns all friends-of-friends (mutual friends) for a given user
-- These are users who are NOT direct friends but share at least one mutual friend
-- Used for expanding visibility when content is set to 'mutual_friends'
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
  friends_of_friends AS (
    SELECT DISTINCT
      CASE
        WHEN f2.user_id = mf.fid THEN f2.friend_id
        ELSE f2.user_id
      END AS fof_id
    FROM friendships f2
    JOIN my_friends mf ON (f2.user_id = mf.fid OR f2.friend_id = mf.fid)
    WHERE f2.status = 'accepted'
  )
  SELECT fof.fof_id AS user_id
  FROM friends_of_friends fof
  WHERE fof.fof_id != p_user_id
    AND fof.fof_id NOT IN (SELECT fid FROM my_friends);
END;
$$;
