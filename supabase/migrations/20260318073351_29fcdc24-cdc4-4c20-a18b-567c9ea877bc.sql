CREATE OR REPLACE FUNCTION public.get_people_you_may_know(p_user_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, mutual_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE 
      WHEN f.user_id = p_user_id THEN f.friend_id 
      ELSE f.user_id 
    END AS friend_id
    FROM friendships f
    WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id)
      AND f.status = 'accepted'
  ),
  friends_of_friends AS (
    SELECT 
      CASE 
        WHEN f2.user_id = mf.friend_id THEN f2.friend_id 
        ELSE f2.user_id 
      END AS fof_id,
      mf.friend_id AS via_friend
    FROM my_friends mf
    JOIN friendships f2 ON (f2.user_id = mf.friend_id OR f2.friend_id = mf.friend_id)
      AND f2.status = 'accepted'
    WHERE CASE 
      WHEN f2.user_id = mf.friend_id THEN f2.friend_id 
      ELSE f2.user_id 
    END != p_user_id
  ),
  candidates AS (
    SELECT 
      fof.fof_id,
      COUNT(DISTINCT fof.via_friend) AS mutual_count
    FROM friends_of_friends fof
    WHERE fof.fof_id NOT IN (SELECT friend_id FROM my_friends)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users bu
        WHERE (bu.blocker_id = p_user_id AND bu.blocked_id = fof.fof_id)
           OR (bu.blocker_id = fof.fof_id AND bu.blocked_id = p_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM friendships fp
        WHERE ((fp.user_id = p_user_id AND fp.friend_id = fof.fof_id)
            OR (fp.user_id = fof.fof_id AND fp.friend_id = p_user_id))
          AND fp.status = 'pending'
      )
    GROUP BY fof.fof_id
  )
  SELECT 
    p.id AS user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    c.mutual_count
  FROM candidates c
  JOIN profiles p ON p.id = c.fof_id
  WHERE p.has_onboarded = true
  ORDER BY c.mutual_count DESC, p.display_name
  LIMIT p_limit;
END;
$function$;