-- Returns the friends the CALLING user shares with another user (p_other_id).
-- Instagram-style mutual friends: every returned row is already a direct,
-- accepted friend of the caller — the only new information revealed is that
-- this person is ALSO friends with p_other_id, which both sides can see.
--
-- Distinct from get_mutual_friend_ids (friends-of-friends visibility expansion):
-- this returns the actual intersection between two specific users, with safe
-- profile fields for display.
CREATE OR REPLACE FUNCTION public.get_mutual_friends_with(p_other_id uuid)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  is_demo boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_friends AS (
    SELECT CASE
      WHEN f.user_id = auth.uid() THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = auth.uid() OR f.friend_id = auth.uid())
      AND f.status = 'accepted'
  ),
  their_friends AS (
    SELECT CASE
      WHEN f.user_id = p_other_id THEN f.friend_id
      ELSE f.user_id
    END AS fid
    FROM friendships f
    WHERE (f.user_id = p_other_id OR f.friend_id = p_other_id)
      AND f.status = 'accepted'
  )
  SELECT p.id, p.display_name, p.username, p.avatar_url, p.is_demo
  FROM profiles p
  JOIN my_friends mf ON mf.fid = p.id
  JOIN their_friends tf ON tf.fid = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND p.id <> p_other_id
    -- Never surface anyone in a block relationship with the caller
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
  ORDER BY p.display_name;
$$;

REVOKE ALL ON FUNCTION public.get_mutual_friends_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mutual_friends_with(uuid) TO authenticated;
