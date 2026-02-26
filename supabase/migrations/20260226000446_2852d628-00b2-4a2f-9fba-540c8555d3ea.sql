
-- Create promotion_interest table for waitlist capture
CREATE TABLE public.promotion_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  user_id uuid NOT NULL,
  tier text NOT NULL,
  billing_period text NOT NULL,
  price_shown integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.promotion_interest ENABLE ROW LEVEL SECURITY;

-- Venue owners can insert their own interest
CREATE POLICY "Venue owners can insert promotion interest"
  ON public.promotion_interest FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_venue_owner(auth.uid(), venue_id));

-- Users can view their own interest entries
CREATE POLICY "Users can view own promotion interest"
  ON public.promotion_interest FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all promotion interest"
  ON public.promotion_interest FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Unique constraint per venue+tier to prevent duplicates
ALTER TABLE public.promotion_interest
  ADD CONSTRAINT unique_venue_tier UNIQUE (venue_id, tier);
