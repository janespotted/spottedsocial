-- Fix notify_post_commented trigger to not abort comment INSERT
-- when notification insert fails (e.g., demo users not in auth.users)
CREATE OR REPLACE FUNCTION public.notify_post_commented()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_owner_id UUID;
  commenter_name TEXT;
  comment_preview TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO post_owner_id FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get commenter's name
  SELECT display_name INTO commenter_name FROM profiles WHERE id = NEW.user_id;

  -- Truncate comment for preview
  comment_preview := LEFT(NEW.text, 50);
  IF LENGTH(NEW.text) > 50 THEN
    comment_preview := comment_preview || '...';
  END IF;

  -- Wrap in exception handler so notification failure doesn't abort the comment
  BEGIN
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (
      NEW.user_id,
      post_owner_id,
      'post_comment',
      COALESCE(commenter_name, 'Someone') || ' commented: "' || comment_preview || '"'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't abort — comment should still persist
    RAISE WARNING 'notify_post_commented failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
