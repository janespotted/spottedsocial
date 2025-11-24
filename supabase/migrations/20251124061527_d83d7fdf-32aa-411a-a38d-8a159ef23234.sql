-- Add is_promoted column to relevant tables for bootstrapped leaderboard
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false;
ALTER TABLE public.night_statuses ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false;
ALTER TABLE public.yap_messages ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_promoted boolean DEFAULT false;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_checkins_promoted ON public.checkins(is_promoted) WHERE is_promoted = true;
CREATE INDEX IF NOT EXISTS idx_venues_promoted ON public.venues(is_promoted) WHERE is_promoted = true;

COMMENT ON COLUMN public.checkins.is_promoted IS 'Marks curated demo venues that appear in bootstrap mode';
COMMENT ON COLUMN public.venues.is_promoted IS 'Marks top-tier venues that appear in bootstrap mode';