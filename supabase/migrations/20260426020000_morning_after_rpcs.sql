-- Morning After RPCs — SECURITY DEFINER to bypass expires_at RLS

-- RPC 1: Get Yaps from venues user visited last night
CREATE OR REPLACE FUNCTION public.get_morning_after_yaps(
  p_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS TABLE (
  id uuid,
  text text,
  image_url text,
  media_type text,
  author_handle text,
  venue_name text,
  score int,
  comments_count int,
  created_at timestamptz,
  is_anonymous boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    y.id, y.text, y.image_url, y.media_type, y.author_handle,
    y.venue_name, y.score, y.comments_count, y.created_at, y.is_anonymous
  FROM yap_messages y
  WHERE
    p_user_id = auth.uid()
    AND p_window_end > now() - interval '36 hours'
    AND y.is_demo = false
    AND y.created_at >= p_window_start
    AND y.created_at < p_window_end
    AND y.venue_name IN (
      SELECT DISTINCT c.venue_name
      FROM checkins c
      WHERE c.user_id = p_user_id
        AND c.started_at >= p_window_start
        AND c.started_at < p_window_end
        AND c.is_demo = false
    )
  ORDER BY y.venue_name, y.score DESC, y.comments_count DESC, y.created_at DESC;
$$;

-- RPC 2: Get user's own expired Newsfeed posts
CREATE OR REPLACE FUNCTION public.get_morning_after_user_posts(
  p_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS TABLE (
  id uuid,
  text text,
  image_url text,
  media_type text,
  venue_name text,
  likes_count int,
  comments_count int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.text, p.image_url, p.media_type,
    p.venue_name, p.likes_count, p.comments_count, p.created_at
  FROM posts p
  WHERE
    p_user_id = auth.uid()
    AND p_window_end > now() - interval '36 hours'
    AND p.user_id = p_user_id
    AND p.is_demo = false
    AND p.created_at >= p_window_start
    AND p.created_at < p_window_end
  ORDER BY p.created_at DESC;
$$;
