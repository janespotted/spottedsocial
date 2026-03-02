
CREATE OR REPLACE FUNCTION public.increment_yap_score(p_yap_id uuid, p_delta int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE yap_messages SET score = score + p_delta WHERE id = p_yap_id;
END;
$$;
