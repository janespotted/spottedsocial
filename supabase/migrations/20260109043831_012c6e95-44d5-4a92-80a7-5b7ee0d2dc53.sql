-- Trigger to create notification when someone likes a post
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
  
  -- Create notification
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (
    NEW.user_id,
    post_owner_id,
    'post_like',
    COALESCE(liker_name, 'Someone') || ' liked your post ❤️'
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_post_liked
  AFTER INSERT ON post_likes
  FOR EACH ROW
  EXECUTE FUNCTION notify_post_liked();

-- Trigger to create notification when someone comments on a post
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
  
  -- Create notification
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (
    NEW.user_id,
    post_owner_id,
    'post_comment',
    COALESCE(commenter_name, 'Someone') || ' commented: "' || comment_preview || '"'
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_post_commented
  AFTER INSERT ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_post_commented();