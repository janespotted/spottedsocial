-- =============================================================================
-- Version the close_friends table + impose canonical RLS
-- =============================================================================
-- WHY: close_friends was created via the Supabase dashboard, not migrations,
-- so its schema and RLS policies were unversioned and unauditable
-- (see _claude_audit/prompts/architecture-review.md, issue P2-11).
-- Rather than copying unknown dashboard policies, this migration REPLACES
-- them with known-good owner-only policies.
--
-- Table shape reconstructed from the generated src/integrations/supabase/types.ts:
--   id uuid, user_id uuid, close_friend_id uuid, created_at timestamptz
-- Semantics (per app usage): ONE-DIRECTIONAL — user_id considers
-- close_friend_id a close friend. Rows are private to their owner; all
-- cross-user checks go through the SECURITY DEFINER fn is_close_friend(),
-- which bypasses RLS, so tightening these policies cannot break visibility.
--
-- Idempotent and safe to run whether or not the table already exists.
-- =============================================================================

-- 1. Ensure the table exists (no-op on prod where it already does)
CREATE TABLE IF NOT EXISTS public.close_friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  close_friend_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ensure dedupe + FK hygiene (generated types show NO foreign keys today)
CREATE UNIQUE INDEX IF NOT EXISTS close_friends_user_pair_uniq
  ON public.close_friends (user_id, close_friend_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'close_friends_user_id_fkey'
  ) THEN
    ALTER TABLE public.close_friends
      ADD CONSTRAINT close_friends_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'close_friends_close_friend_id_fkey'
  ) THEN
    ALTER TABLE public.close_friends
      ADD CONSTRAINT close_friends_close_friend_id_fkey
      FOREIGN KEY (close_friend_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Drop ALL existing policies (names unknown — they were dashboard-created)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'close_friends'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.close_friends', pol.policyname);
  END LOOP;
END $$;

-- 4. Canonical owner-only policies
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "close_friends_select_own" ON public.close_friends
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "close_friends_insert_own" ON public.close_friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "close_friends_delete_own" ON public.close_friends
  FOR DELETE USING (auth.uid() = user_id);

-- No UPDATE policy: rows are add/remove only in the app.

GRANT SELECT, INSERT, DELETE ON public.close_friends TO authenticated;
REVOKE ALL ON public.close_friends FROM anon;

-- =============================================================================
-- VERIFICATION (run once access to the database is restored):
--   select policyname, cmd, qual from pg_policies
--     where tablename = 'close_friends';          -- exactly the 3 above
--   -- as test user A: can see own rows, cannot see user B's rows,
--   -- and a close-friends-only user B who added A is still visible to A
--   -- on the map (is_close_friend is SECURITY DEFINER, unaffected by RLS).
-- =============================================================================
