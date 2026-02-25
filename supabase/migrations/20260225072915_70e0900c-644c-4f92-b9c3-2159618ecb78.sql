-- Add private party columns to yap_messages
ALTER TABLE public.yap_messages ADD COLUMN is_private_party boolean DEFAULT false;
ALTER TABLE public.yap_messages ADD COLUMN party_lat double precision;
ALTER TABLE public.yap_messages ADD COLUMN party_lng double precision;

-- Drop the old overly permissive SELECT policy
DROP POLICY IF EXISTS "Yap messages viewable by everyone" ON public.yap_messages;

-- Create new SELECT policy: public yaps visible to all, private party yaps only to nearby users
CREATE POLICY "Yap messages viewable with privacy" ON public.yap_messages
FOR SELECT USING (
  is_private_party = false
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM night_statuses ns
      WHERE ns.user_id = auth.uid()
        AND ns.status = 'out'
        AND ns.lat IS NOT NULL AND ns.lng IS NOT NULL
        AND yap_messages.party_lat IS NOT NULL AND yap_messages.party_lng IS NOT NULL
        AND (
          6371000 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(ns.lat)) * cos(radians(yap_messages.party_lat)) *
              cos(radians(yap_messages.party_lng) - radians(ns.lng)) +
              sin(radians(ns.lat)) * sin(radians(yap_messages.party_lat))
            ))
          )
        ) <= 200
    )
  )
);