-- Create plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  venue_id UUID REFERENCES public.venues(id),
  venue_name TEXT NOT NULL,
  plan_date DATE NOT NULL,
  plan_time TIME NOT NULL,
  description TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'friends',
  score INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_demo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Plans viewable by friends based on visibility
CREATE POLICY "Plans viewable by friends"
ON public.plans FOR SELECT
USING (
  auth.uid() = user_id 
  OR (
    visibility = 'friends' AND EXISTS (
      SELECT 1 FROM friendships
      WHERE ((friendships.user_id = auth.uid() AND friendships.friend_id = plans.user_id)
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = plans.user_id))
        AND friendships.status = 'accepted'
    )
  )
  OR (
    visibility = 'close_friends' AND public.is_close_friend(auth.uid(), plans.user_id)
  )
);

-- Users can create own plans
CREATE POLICY "Users can create own plans"
ON public.plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own plans
CREATE POLICY "Users can update own plans"
ON public.plans FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete own plans
CREATE POLICY "Users can delete own plans"
ON public.plans FOR DELETE
USING (auth.uid() = user_id);

-- Create plan_votes table
CREATE TABLE public.plan_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

-- Enable RLS
ALTER TABLE public.plan_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can view votes
CREATE POLICY "Anyone can view plan votes"
ON public.plan_votes FOR SELECT
USING (true);

-- Users can create votes
CREATE POLICY "Users can create plan votes"
ON public.plan_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update own votes
CREATE POLICY "Users can update own plan votes"
ON public.plan_votes FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete own votes
CREATE POLICY "Users can delete own plan votes"
ON public.plan_votes FOR DELETE
USING (auth.uid() = user_id);

-- Create plan_comments table
CREATE TABLE public.plan_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plan_comments ENABLE ROW LEVEL SECURITY;

-- Comments viewable on visible plans
CREATE POLICY "Plan comments viewable"
ON public.plan_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM plans WHERE plans.id = plan_comments.plan_id
    AND (
      auth.uid() = plans.user_id 
      OR EXISTS (
        SELECT 1 FROM friendships
        WHERE ((friendships.user_id = auth.uid() AND friendships.friend_id = plans.user_id)
            OR (friendships.friend_id = auth.uid() AND friendships.user_id = plans.user_id))
          AND friendships.status = 'accepted'
      )
    )
  )
);

-- Users can create comments
CREATE POLICY "Users can create plan comments"
ON public.plan_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete own comments
CREATE POLICY "Users can delete own plan comments"
ON public.plan_comments FOR DELETE
USING (auth.uid() = user_id);

-- Function to update plan score
CREATE OR REPLACE FUNCTION public.update_plan_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.plans
    SET score = score + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END
    WHERE id = NEW.plan_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.plans
    SET score = score - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END
    WHERE id = OLD.plan_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.plans
    SET score = score 
      - CASE WHEN OLD.vote_type = 'up' THEN 1 ELSE -1 END
      + CASE WHEN NEW.vote_type = 'up' THEN 1 ELSE -1 END
    WHERE id = NEW.plan_id;
  END IF;
  RETURN NULL;
END;
$function$;

-- Trigger for plan score updates
CREATE TRIGGER update_plan_score_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.plan_votes
FOR EACH ROW
EXECUTE FUNCTION public.update_plan_score();

-- Function to update plan comments count
CREATE OR REPLACE FUNCTION public.update_plan_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.plans
    SET comments_count = comments_count + 1
    WHERE id = NEW.plan_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.plans
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.plan_id;
  END IF;
  RETURN NULL;
END;
$function$;

-- Trigger for plan comments count
CREATE TRIGGER update_plan_comments_count_trigger
AFTER INSERT OR DELETE ON public.plan_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_plan_comments_count();