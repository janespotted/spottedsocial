DROP POLICY IF EXISTS "Venue owners can view checkins for their venues" ON public.checkins;

CREATE OR REPLACE FUNCTION public.get_venue_checkins(p_venue_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  venue_name text,
  started_at timestamptz,
  ended_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_venue_owner(auth.uid(), p_venue_id) AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT 
    c.id,
    CASE WHEN can_see_location(auth.uid(), c.user_id) THEN c.user_id ELSE NULL END,
    CASE WHEN can_see_location(auth.uid(), c.user_id) THEN p.display_name ELSE 'Anonymous' END,
    CASE WHEN can_see_location(auth.uid(), c.user_id) THEN p.avatar_url ELSE NULL END,
    c.venue_name,
    c.started_at,
    c.ended_at
  FROM checkins c
  LEFT JOIN profiles p ON p.id = c.user_id
  WHERE c.venue_id = p_venue_id
  ORDER BY c.started_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_checkins(uuid) TO authenticated;