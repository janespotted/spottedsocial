-- Add private party columns to night_statuses
ALTER TABLE public.night_statuses
ADD COLUMN is_private_party boolean DEFAULT false,
ADD COLUMN party_neighborhood text,
ADD COLUMN party_address text;

-- Add comment for clarity
COMMENT ON COLUMN public.night_statuses.is_private_party IS 'True when user is at a private party instead of a venue';
COMMENT ON COLUMN public.night_statuses.party_neighborhood IS 'Neighborhood where the private party is located (fuzzy location)';
COMMENT ON COLUMN public.night_statuses.party_address IS 'Exact address of the private party (only shared with invited friends)';