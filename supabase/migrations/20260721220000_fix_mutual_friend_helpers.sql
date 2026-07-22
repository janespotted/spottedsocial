-- Recreate all friendship helper functions with correct definitions
-- These may have been created via dashboard with bugs

-- is_direct_friend: true if viewer and target have an accepted friendship
CREATE OR REPLACE FUNCTION public.is_direct_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND (
        (user_id = viewer_id AND friend_id = target_user_id)
        OR (user_id = target_user_id AND friend_id = viewer_id)
      )
  )
$$;

-- is_close_friend: true if target considers viewer a close friend (one-directional)
CREATE OR REPLACE FUNCTION public.is_close_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM close_friends
    WHERE user_id = target_user_id
      AND close_friend_id = viewer_id
  )
$$;

-- is_mutual_friend: true if viewer and target share at least one common friend
-- (i.e. there exists user X who is a direct friend of BOTH viewer and target)
CREATE OR REPLACE FUNCTION public.is_mutual_friend(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Get all friends of viewer
    SELECT 1 FROM (
      SELECT friend_id AS fid FROM friendships
        WHERE user_id = viewer_id AND status = 'accepted'
      UNION
      SELECT user_id AS fid FROM friendships
        WHERE friend_id = viewer_id AND status = 'accepted'
    ) viewer_friends
    WHERE viewer_friends.fid IN (
      -- Intersect with all friends of target
      SELECT friend_id FROM friendships
        WHERE user_id = target_user_id AND status = 'accepted'
      UNION
      SELECT user_id FROM friendships
        WHERE friend_id = target_user_id AND status = 'accepted'
    )
  )
$$;

-- is_friend_or_mutual: true if direct friend OR mutual friend (friend-of-friend)
CREATE OR REPLACE FUNCTION public.is_friend_or_mutual(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_direct_friend(viewer_id, target_user_id)
      OR public.is_mutual_friend(viewer_id, target_user_id)
$$;
