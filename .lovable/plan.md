

# Fix Business Yap Board UX + Promotion Waitlist

## Overview
Five changes across business portal pages, consumer-side Yap components, and a new database table.

---

## 1. Yap Board Improvements (BusinessYap.tsx)

### 1a. Character counter (45/280)
Add a visible character counter below the Textarea, styled like the consumer-side Yap input. The `maxLength={280}` is already on the Textarea; add a `<span>` showing `{newMessage.length}/280`.

### 1b. Cap pinned messages at 3
Before toggling a message to pinned, count currently pinned messages for the venue. If already 3 pinned and trying to pin another, show `toast.error("You can only pin up to 3 messages at a time. Unpin one first.")` and abort.

### 1c. Delete confirmation dialog
Wrap the delete action in an `AlertDialog` from the existing UI library. Prompt: "Are you sure you want to delete this message? This can't be undone." with Cancel and Delete buttons.

### 1d. Auto-unpin after 24 hours
When fetching messages in `BusinessYap.tsx`, after receiving data, check each pinned message's `created_at`. If older than 24 hours, fire an update to set `is_pinned = false` and reflect it locally. Same logic in `VenueYapThread.tsx`'s `fetchPinnedVenueMessages` — filter out pinned messages older than 24h client-side (they'll also get unpinned on next business portal load).

---

## 2. Fix Venue Name Matching (VenueYapThread.tsx)

The current `fetchPinnedVenueMessages` already resolves `venue_id` from `venueName` via `supabase.from("venues").select("id").eq("name", venueName).maybeSingle()` at line 149. The `VenueSelector` dropdown shows `{name} ({neighborhood})` but the `venueName` passed to `VenueYapThread` comes from `yap_messages.venue_name` or `night_statuses.venue_name`, which stores just the venue name (no neighborhood suffix). So the lookup already works correctly — the name in the `venues` table matches what `VenueYapThread` receives. No code change needed here; just confirming the data flow is correct.

---

## 3. Update Promotion Pricing (BusinessPromote.tsx)

Update the hardcoded price values:
- Leaderboard Boost: `weeklyPrice: 29`, `monthlyPrice: 79`
- Map Highlight: `weeklyPrice: 19`, `monthlyPrice: 49`

---

## 4. Promotion Waitlist Capture

### 4a. New database table
Create `promotion_interest` table via migration:
```sql
CREATE TABLE promotion_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  user_id uuid NOT NULL,
  tier text NOT NULL,
  billing_period text NOT NULL,
  price_shown integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE promotion_interest ENABLE ROW LEVEL SECURITY;

-- Venue owners can insert their own interest
CREATE POLICY "Venue owners can insert promotion interest"
  ON promotion_interest FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_venue_owner(auth.uid(), venue_id));

-- Users can view their own interest entries
CREATE POLICY "Users can view own promotion interest"
  ON promotion_interest FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all promotion interest"
  ON promotion_interest FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add unique constraint to prevent duplicate entries per tier
ALTER TABLE promotion_interest
  ADD CONSTRAINT unique_venue_tier UNIQUE (venue_id, tier);
```

### 4b. Replace buy buttons with waitlist drawer (BusinessPromote.tsx)
When a pricing button is clicked, open a Drawer/bottom sheet showing:
- "We're launching promotions soon! Want to be first in line?"
- Selected tier name and price
- "Join the waitlist" button

On confirmation, attempt insert into `promotion_interest`. If unique constraint violation (code `23505`), show: "You're already on the list for this — we'll be in touch soon!" Otherwise show: "You're on the list! We'll reach out when promotions go live."

---

## 5. Pinned Message Indicator on Yap Directory (YapTab.tsx)

After fetching yap quotes and venue metadata, also query `venue_yap_messages` for pinned message counts grouped by venue:
```sql
SELECT venue_id, COUNT(*) as count
FROM venue_yap_messages
WHERE is_pinned = true AND (expires_at IS NULL OR expires_at > now())
GROUP BY venue_id
```
Then join with the venues table to get venue names. On each quote card in the directory, if the venue has pinned messages, show a subtle line like `📌 1 update from venue` in muted text below the venue name.

---

## Files Modified
- `src/pages/business/BusinessYap.tsx` — char counter, pin cap, delete confirmation, auto-unpin
- `src/pages/business/BusinessPromote.tsx` — pricing update, waitlist drawer
- `src/components/messages/YapTab.tsx` — pinned indicator query + display
- `src/components/messages/VenueYapThread.tsx` — auto-unpin stale pinned messages
- New migration for `promotion_interest` table

