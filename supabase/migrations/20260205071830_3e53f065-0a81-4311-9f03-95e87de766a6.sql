-- Add leaderboard_promo_order column to venues table
-- Order 1-2 = Active (shown on leaderboard)
-- Order 3+ = Waitlist (not shown)
-- NULL = Not in promotion system at all

ALTER TABLE public.venues 
ADD COLUMN leaderboard_promo_order integer DEFAULT NULL;

-- Create index for efficient ordering queries
CREATE INDEX idx_venues_leaderboard_promo_order 
ON public.venues (leaderboard_promo_order) 
WHERE leaderboard_promo_order IS NOT NULL;

-- Migrate existing promoted venues: assign orders based on current is_leaderboard_promoted status
-- Active venues (order 1, 2) will be first 2 promoted, rest go to waitlist (order 3+)
-- This uses a CTE to rank by city and assign orders
WITH ranked_promoted AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY city ORDER BY popularity_rank NULLS LAST, name) as rn
  FROM public.venues 
  WHERE is_leaderboard_promoted = true
)
UPDATE public.venues v
SET leaderboard_promo_order = rp.rn
FROM ranked_promoted rp
WHERE v.id = rp.id;