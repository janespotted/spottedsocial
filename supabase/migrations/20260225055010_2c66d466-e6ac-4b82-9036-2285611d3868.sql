-- Make yap_messages publicly readable (allow anon role)
DROP POLICY IF EXISTS "Yap messages viewable by all authenticated users" ON public.yap_messages;
CREATE POLICY "Yap messages viewable by everyone"
  ON public.yap_messages FOR SELECT
  USING (true);

-- Make yap_comments publicly readable (allow anon role)
DROP POLICY IF EXISTS "Users can view all comments" ON public.yap_comments;
CREATE POLICY "Yap comments viewable by everyone"
  ON public.yap_comments FOR SELECT
  USING (true);

-- Make yap_votes publicly readable (for score display)
DROP POLICY IF EXISTS "Users can view all votes" ON public.yap_votes;
CREATE POLICY "Yap votes viewable by everyone"
  ON public.yap_votes FOR SELECT
  USING (true);