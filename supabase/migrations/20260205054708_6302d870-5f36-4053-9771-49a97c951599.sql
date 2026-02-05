-- =============================================
-- BUSINESS PORTAL DATABASE SCHEMA
-- =============================================

-- 1. Table: venue_claim_requests
-- Handles verification workflow before granting ownership
CREATE TABLE venue_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  venue_name text, -- if venue doesn't exist yet
  business_email text NOT NULL,
  business_phone text,
  verification_notes text,
  status text DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE venue_claim_requests ENABLE ROW LEVEL SECURITY;

-- 2. Table: venue_owners
-- Links users to venues they manage (created after claim approval)
CREATE TABLE venue_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'owner', -- 'owner' | 'manager' | 'staff'
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, venue_id)
);

ALTER TABLE venue_owners ENABLE ROW LEVEL SECURITY;

-- 3. Table: venue_promotions
-- Tracks paid promotions with proper status tracking
CREATE TABLE venue_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  promotion_type text NOT NULL, -- 'leaderboard' | 'map'
  status text DEFAULT 'pending', -- 'pending' | 'active' | 'expired' | 'canceled'
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  amount_paid integer, -- in cents
  stripe_payment_id text,
  stripe_subscription_id text, -- for recurring
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE venue_promotions ENABLE ROW LEVEL SECURITY;

-- 4. Table: venue_yap_messages
-- Venue announcements with proper identity handling
CREATE TABLE venue_yap_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  posted_by uuid REFERENCES auth.users(id) NOT NULL, -- actual user who posted
  display_as text DEFAULT 'venue', -- 'venue' | 'personal' (future-proof)
  text text NOT NULL,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz -- nullable for evergreen posts
);

ALTER TABLE venue_yap_messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Check if user owns a specific venue
CREATE OR REPLACE FUNCTION is_venue_owner(check_user_id uuid, check_venue_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_owners
    WHERE user_id = check_user_id
    AND venue_id = check_venue_id
  )
$$;

-- Check if user owns any venue
CREATE OR REPLACE FUNCTION is_any_venue_owner(check_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_owners
    WHERE user_id = check_user_id
  )
$$;

-- =============================================
-- RLS POLICIES: venue_claim_requests
-- =============================================

-- Users can submit their own claims
CREATE POLICY "Users can create own claim requests"
ON venue_claim_requests FOR INSERT TO public
WITH CHECK (auth.uid() = user_id);

-- Users can view their own claims
CREATE POLICY "Users can view own claim requests"
ON venue_claim_requests FOR SELECT TO public
USING (auth.uid() = user_id);

-- Admins can view all claims
CREATE POLICY "Admins can view all claim requests"
ON venue_claim_requests FOR SELECT TO public
USING (has_role(auth.uid(), 'admin'));

-- Admins can update claims (approve/reject)
CREATE POLICY "Admins can update claim requests"
ON venue_claim_requests FOR UPDATE TO public
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES: venue_owners
-- =============================================

-- Users can view their own venue ownerships
CREATE POLICY "Users can view own venue ownerships"
ON venue_owners FOR SELECT TO public
USING (auth.uid() = user_id);

-- Admins can manage all venue owners (SELECT)
CREATE POLICY "Admins can view venue owners"
ON venue_owners FOR SELECT TO public
USING (has_role(auth.uid(), 'admin'));

-- Admins can insert venue owners
CREATE POLICY "Admins can insert venue owners"
ON venue_owners FOR INSERT TO public
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can update venue owners
CREATE POLICY "Admins can update venue owners"
ON venue_owners FOR UPDATE TO public
USING (has_role(auth.uid(), 'admin'));

-- Admins can delete venue owners
CREATE POLICY "Admins can delete venue owners"
ON venue_owners FOR DELETE TO public
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES: venue_promotions
-- =============================================

-- Venue owners can view their promotions
CREATE POLICY "Venue owners can view their promotions"
ON venue_promotions FOR SELECT TO public
USING (is_venue_owner(auth.uid(), venue_id));

-- Venue owners can create promotions for their venues
CREATE POLICY "Venue owners can create promotions"
ON venue_promotions FOR INSERT TO public
WITH CHECK (
  is_venue_owner(auth.uid(), venue_id)
  AND auth.uid() = created_by
);

-- Admins can view all promotions
CREATE POLICY "Admins can view all promotions"
ON venue_promotions FOR SELECT TO public
USING (has_role(auth.uid(), 'admin'));

-- Admins can manage all promotions
CREATE POLICY "Admins can manage promotions"
ON venue_promotions FOR ALL TO public
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES: venue_yap_messages
-- =============================================

-- Venue owners can insert messages for their venues
CREATE POLICY "Venue owners can create yap messages"
ON venue_yap_messages FOR INSERT TO public
WITH CHECK (
  is_venue_owner(auth.uid(), venue_id)
  AND auth.uid() = posted_by
);

-- Venue owners can update their venue's messages
CREATE POLICY "Venue owners can update their venue yap messages"
ON venue_yap_messages FOR UPDATE TO public
USING (is_venue_owner(auth.uid(), venue_id));

-- Venue owners can delete their venue's messages
CREATE POLICY "Venue owners can delete their venue yap messages"
ON venue_yap_messages FOR DELETE TO public
USING (is_venue_owner(auth.uid(), venue_id));

-- Authenticated users can read venue yap messages (not expired)
CREATE POLICY "Authenticated users can view venue yap messages"
ON venue_yap_messages FOR SELECT TO public
USING (
  auth.uid() IS NOT NULL
  AND (expires_at IS NULL OR expires_at > now())
);

-- =============================================
-- ADDITIONAL RLS: checkins for venue owners
-- =============================================

-- Venue owners can read check-ins for their venues
CREATE POLICY "Venue owners can view checkins for their venues"
ON checkins FOR SELECT TO public
USING (is_venue_owner(auth.uid(), venue_id));