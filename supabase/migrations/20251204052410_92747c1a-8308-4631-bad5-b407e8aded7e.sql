-- Add likes_count column to post_comments
ALTER TABLE public.post_comments 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Create post_comment_likes table
CREATE TABLE public.post_comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view comment likes"
ON public.post_comment_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like comments"
ON public.post_comment_likes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can unlike their own likes"
ON public.post_comment_likes FOR DELETE
USING (auth.uid() = user_id);

-- Trigger function to update likes count
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments
    SET likes_count = likes_count + 1
    WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger
CREATE TRIGGER on_comment_like_change
AFTER INSERT OR DELETE ON public.post_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_comment_likes_count();