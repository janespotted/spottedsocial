-- Location pipeline event logging for tuning accuracy and prompt timing
CREATE TABLE public.location_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluation_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  evaluated_venue_id UUID,
  evaluated_venue_name TEXT,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  gps_accuracy_meters NUMERIC,
  distance_to_venue_meters NUMERIC,
  dwell_time_seconds NUMERIC,
  speed_mph NUMERIC,
  time_of_day SMALLINT,
  day_of_week SMALLINT,
  user_status_before TEXT,
  user_status_after TEXT,
  thresholds_met JSONB,
  result TEXT,
  friends_at_venue_count SMALLINT DEFAULT 0
);

-- RLS: users can only read their own events
ALTER TABLE public.location_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own location events"
ON public.location_events
FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can read own location events"
ON public.location_events
FOR SELECT
TO public
USING (auth.uid() = user_id);

-- Indexes for analytics queries
CREATE INDEX idx_location_events_user_id ON public.location_events(user_id);
CREATE INDEX idx_location_events_evaluation_id ON public.location_events(evaluation_id);
CREATE INDEX idx_location_events_event_type ON public.location_events(event_type);
CREATE INDEX idx_location_events_created_at ON public.location_events(created_at DESC);
CREATE INDEX idx_location_events_venue ON public.location_events(evaluated_venue_id);

-- TTL: delete rows older than 90 days
-- Run via pg_cron (configure in Supabase dashboard > Database > Extensions > pg_cron):
-- SELECT cron.schedule('cleanup-location-events-90d', '0 6 * * *', $$DELETE FROM public.location_events WHERE created_at < now() - interval '90 days'$$);
