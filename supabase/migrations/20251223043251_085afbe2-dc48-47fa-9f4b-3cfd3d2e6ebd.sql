-- Drop the existing check constraint and recreate with 'pb' included
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS valid_city;

ALTER TABLE public.venues ADD CONSTRAINT valid_city CHECK (city IS NULL OR city IN ('nyc', 'la', 'pb'));