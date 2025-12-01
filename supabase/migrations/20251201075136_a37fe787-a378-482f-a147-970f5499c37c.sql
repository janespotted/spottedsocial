-- Create venue_reviews table
CREATE TABLE public.venue_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id)
);

-- Create review_votes table for upvote/downvote
CREATE TABLE public.review_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.venue_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

-- Add score column to venue_reviews for caching vote totals
ALTER TABLE public.venue_reviews ADD COLUMN score INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for venue_reviews
CREATE POLICY "Anyone can view reviews"
ON public.venue_reviews
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create reviews"
ON public.venue_reviews
FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
ON public.venue_reviews
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
ON public.venue_reviews
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for review_votes
CREATE POLICY "Anyone can view review votes"
ON public.review_votes
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create votes"
ON public.review_votes
FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
ON public.review_votes
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
ON public.review_votes
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for reviews
ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_reviews;