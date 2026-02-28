
-- Step 1: Drop permissive INSERT policy
DROP POLICY IF EXISTS "Users can create notifications" ON public.notifications;

-- Step 2: Block all direct inserts
CREATE POLICY "Only server can create notifications"
  ON public.notifications
  FOR INSERT WITH CHECK (false);

-- Step 3: Create single notification RPC
CREATE OR REPLACE FUNCTION public.create_notification(
  p_receiver_id uuid,
  p_type text,
  p_message text
) RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN QUERY
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (auth.uid(), p_receiver_id, p_type, p_message)
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text) TO authenticated;

-- Step 4: Create batch notification RPC
CREATE OR REPLACE FUNCTION public.create_notifications_batch(
  p_notifications jsonb
) RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  notif jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    RETURN QUERY
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (auth.uid(), (notif->>'receiver_id')::uuid, notif->>'type', notif->>'message')
    RETURNING *;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notifications_batch(jsonb) TO authenticated;
