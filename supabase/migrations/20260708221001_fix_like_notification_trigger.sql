-- Fix notify_post_liked trigger to not abort like INSERT
-- when notification insert fails (e.g., demo users not in auth.users)
CREATE OR REPLACE FUNCTION public.notify_post_liked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner_id UUID;
  liker_name TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get liker's name
  SELECT display_name INTO liker_name FROM profiles WHERE id = NEW.user_id;

  -- Wrap in exception handler so notification failure doesn't abort the like
  BEGIN
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (
      NEW.user_id,
      post_owner_id,
      'post_like',
      COALESCE(liker_name, 'Someone') || ' liked your post ❤️'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_post_liked failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
