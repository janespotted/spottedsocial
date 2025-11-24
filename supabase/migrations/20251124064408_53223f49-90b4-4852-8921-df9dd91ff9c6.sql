-- Fix search_path for update_post_comments_count function
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Fix search_path for update_yap_comments_count function
CREATE OR REPLACE FUNCTION public.update_yap_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE yap_messages 
    SET comments_count = comments_count + 1
    WHERE id = NEW.yap_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE yap_messages 
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.yap_id;
  END IF;
  RETURN NULL;
END;
$$;