

## Business Dashboard - Venue Owner Portal (Revised)

### Overview
Create a complete business-side interface for bars and venue owners. This revision incorporates all feedback for a cleaner, more maintainable approach.

---

### Key Changes from Original Plan

| Area | Original | Revised |
|------|----------|---------|
| Role detection | New `venue_owner` app_role enum | `EXISTS (SELECT 1 FROM venue_owners WHERE user_id = auth.uid())` |
| Venue claiming | Direct creation | `venue_claim_requests` table with admin approval |
| Promotions | Missing status/FK | Added `status` column + proper `created_by` FK |
| Yap messages | Just `user_id` | Added `posted_by`, `display_as`, nullable `expires_at` |
| Analytics | Heatmaps, charts | MVP: today/7d/30d counts + peak hour |
| RLS | Incomplete | Full policies for all tables |

---

### Database Schema

#### 1. Table: `venue_claim_requests`
Handles verification workflow before granting ownership:

```sql
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
```

#### 2. Table: `venue_owners`
Links users to venues they manage (created after claim approval):

```sql
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
```

#### 3. Table: `venue_promotions`
Tracks paid promotions with proper status tracking:

```sql
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
```

#### 4. Table: `venue_yap_messages`
Venue announcements with proper identity handling:

```sql
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
```

#### 5. Helper Function: `is_venue_owner`

```sql
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
```

#### 6. Helper Function: `is_any_venue_owner`

```sql
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
```

---

### Complete RLS Policies

#### For `venue_claim_requests`:
```sql
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
```

#### For `venue_owners`:
```sql
-- Users can view their own venue ownerships
CREATE POLICY "Users can view own venue ownerships"
ON venue_owners FOR SELECT TO public
USING (auth.uid() = user_id);

-- Admins can manage all venue owners
CREATE POLICY "Admins can manage venue owners"
ON venue_owners FOR ALL TO public
USING (has_role(auth.uid(), 'admin'));
```

#### For `venue_promotions`:
```sql
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

-- Admins can manage all promotions
CREATE POLICY "Admins can manage all promotions"
ON venue_promotions FOR ALL TO public
USING (has_role(auth.uid(), 'admin'));
```

#### For `venue_yap_messages`:
```sql
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
```

#### For `checkins` (add policy for venue owners):
```sql
-- Venue owners can read check-ins for their venues
CREATE POLICY "Venue owners can view checkins for their venues"
ON checkins FOR SELECT TO public
USING (is_venue_owner(auth.uid(), venue_id));
```

---

### MVP Analytics (Simplified)

Instead of complex heatmaps and charts, the dashboard will show:

```text
+------------------------------------------+
| 📊 Your Venue Analytics                  |
+------------------------------------------+
|                                          |
|  Check-ins                               |
|  ┌──────────┬──────────┬──────────┐      |
|  │  Today   │  7 Days  │ 30 Days  │      |
|  │    42    │   287    │  1,203   │      |
|  └──────────┴──────────┴──────────┘      |
|                                          |
|  ⏰ Peak Hour: 11pm - 12am               |
|     (based on last 7 days)               |
|                                          |
|  📈 vs Last Week: +15%                   |
|                                          |
+------------------------------------------+
```

SQL for analytics (simple, efficient):

```sql
-- Today's check-ins
SELECT COUNT(*) FROM checkins 
WHERE venue_id = $1 AND created_at >= CURRENT_DATE;

-- Last 7 days
SELECT COUNT(*) FROM checkins 
WHERE venue_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days';

-- Last 30 days
SELECT COUNT(*) FROM checkins 
WHERE venue_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days';

-- Peak hour (simple group by)
SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
FROM checkins
WHERE venue_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY hour
ORDER BY count DESC
LIMIT 1;
```

---

### Claim Verification Workflow

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User submits   │     │  Admin reviews   │     │  Claim approved │
│  claim request  │ ──> │  in admin panel  │ ──> │  venue_owners   │
│  (pending)      │     │                  │     │  row created    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │  Claim rejected  │
                        │  (user notified) │
                        └──────────────────┘
```

---

### Files to Create

| File | Purpose |
|------|---------|
| `src/pages/business/BusinessLanding.tsx` | Marketing landing + sign up CTA |
| `src/pages/business/BusinessAuth.tsx` | Auth + claim venue flow |
| `src/pages/business/BusinessDashboard.tsx` | Main dashboard with MVP analytics |
| `src/pages/business/BusinessPromote.tsx` | Purchase promotions |
| `src/pages/business/BusinessYap.tsx` | Post venue announcements |
| `src/components/business/BusinessRoute.tsx` | Route guard using `is_any_venue_owner()` |
| `src/components/business/BusinessLayout.tsx` | Shared layout for business pages |
| `src/components/business/VenueSelector.tsx` | Switch between owned venues |
| `src/components/business/ClaimVenueForm.tsx` | Venue search + claim submission |

### Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/business/*` routes |
| `src/pages/Admin.tsx` | Add claim requests approval panel |
| `src/pages/Leaderboard.tsx` | Check `venue_promotions` for active promos |
| `src/pages/Map.tsx` | Highlight promoted venues |
| `src/components/messages/YapTab.tsx` | Show venue messages with @VenueName badge |

---

### Implementation Phases

**Phase 1 - Foundation (This PR)**
- Database migrations (all 4 tables + functions + RLS)
- Business auth page with claim submission
- Admin panel for reviewing claims
- Basic dashboard with MVP analytics

**Phase 2 - Yap Integration**
- Venue owner posting to Yap
- @VenueName display rendering
- Pinned messages in consumer feed

**Phase 3 - Promotions (Stripe)**
- Enable Stripe integration
- Promotion purchase flow
- Webhook to activate/expire promotions
- Connect to leaderboard/map display

---

### Consumer-Side Yap Rendering

When displaying venue yap messages in the consumer feed:

```typescript
// In YapTab.tsx
const isVenueMessage = message.venue_id && message.display_as === 'venue';

return (
  <div className="yap-message">
    {isVenueMessage ? (
      <span className="venue-badge">
        🏪 @{venueName} <VerifiedBadge />
      </span>
    ) : (
      <span>@{username}</span>
    )}
    <p>{message.text}</p>
  </div>
);
```

---

### Route Guard Implementation

```typescript
// BusinessRoute.tsx
export function BusinessRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isVenueOwner, setIsVenueOwner] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      supabase.rpc('is_any_venue_owner', { check_user_id: user.id })
        .then(({ data }) => setIsVenueOwner(data ?? false));
    }
  }, [user]);

  if (isVenueOwner === null) return <Loading />;
  if (!isVenueOwner) return <Navigate to="/business" replace />;
  
  return <>{children}</>;
}
```

---

### Ready to implement Phase 1?

This will create the database schema, claim workflow, and basic dashboard with the simplified analytics approach.

