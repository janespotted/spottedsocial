-- Add reported_venue_id column to reports table for venue reporting
ALTER TABLE public.reports 
ADD COLUMN reported_venue_id uuid REFERENCES public.venues(id);