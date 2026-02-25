
-- Drop the existing SELECT policy
DROP POLICY "Authenticated users can view venue yap messages" ON venue_yap_messages;

-- Policy A: Pinned messages visible to everyone (including anonymous)
CREATE POLICY "Anyone can view pinned venue yap messages"
  ON venue_yap_messages FOR SELECT
  USING (is_pinned = true AND (expires_at IS NULL OR expires_at > now()));

-- Policy B: Non-pinned messages visible to authenticated users only
CREATE POLICY "Authenticated users can view non-pinned venue yap messages"
  ON venue_yap_messages FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_pinned = false AND (expires_at IS NULL OR expires_at > now()));
