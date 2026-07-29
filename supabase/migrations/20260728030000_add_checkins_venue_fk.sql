-- Add missing FK from checkins.venue_id → venues.id
-- PostgREST requires FK constraints to resolve embed relationships
-- (e.g. venues!left(city) in ActivityTab).

-- 1. Null orphan venue_ids that reference nonexistent venues
UPDATE public.checkins
  SET venue_id = NULL
  WHERE venue_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.venues WHERE id = checkins.venue_id);

-- 2. Add the FK constraint
ALTER TABLE public.checkins
  ADD CONSTRAINT checkins_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE SET NULL;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
