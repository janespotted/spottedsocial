-- RPC to clear a push token from all profiles EXCEPT the given user.
-- Must be SECURITY DEFINER because the "Users can update own profile" RLS
-- policy (auth.uid() = id) blocks client-side updates to other users' rows.
-- Without this, two accounts on the same device share an APNs token and both
-- receive each other's push notifications.

CREATE OR REPLACE FUNCTION public.clear_stale_push_token(
  p_token text,
  p_keep_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE profiles
  SET apns_device_token = NULL,
      push_token = NULL
  WHERE apns_device_token = p_token
    AND id <> p_keep_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_stale_push_token(text, uuid) TO authenticated;
