-- Create venue_location_reports table for crowdsourced corrections
CREATE TABLE public.venue_location_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_lat DOUBLE PRECISION NOT NULL,
  reported_lng DOUBLE PRECISION NOT NULL,
  user_lat DOUBLE PRECISION NOT NULL,
  user_lng DOUBLE PRECISION NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('wrong_location', 'confirmed', 'new_venue', 'correction')),
  suggested_venue_name TEXT,
  suggested_venue_type TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'reviewed')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create location_detection_logs table for analytics
CREATE TABLE public.location_detection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('detection', 'confirmation', 'correction', 'dismissal', 'error')),
  detected_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  confirmed_venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  gps_accuracy DOUBLE PRECISION,
  distance_to_venue DOUBLE PRECISION,
  was_correct BOOLEAN,
  error_type TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add is_user_submitted column to venues for tracking user-submitted venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS is_user_submitted BOOLEAN DEFAULT false;

-- Enable RLS on new tables
ALTER TABLE public.venue_location_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_detection_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for venue_location_reports
CREATE POLICY "Users can create their own reports"
ON public.venue_location_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own reports"
ON public.venue_location_reports
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
ON public.venue_location_reports
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reports"
ON public.venue_location_reports
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for location_detection_logs
CREATE POLICY "Users can create their own logs"
ON public.location_detection_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own logs"
ON public.location_detection_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all logs"
ON public.location_detection_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_venue_location_reports_venue_id ON public.venue_location_reports(venue_id);
CREATE INDEX idx_venue_location_reports_status ON public.venue_location_reports(status);
CREATE INDEX idx_venue_location_reports_user_id ON public.venue_location_reports(user_id);
CREATE INDEX idx_location_detection_logs_user_id ON public.location_detection_logs(user_id);
CREATE INDEX idx_location_detection_logs_event_type ON public.location_detection_logs(event_type);
CREATE INDEX idx_location_detection_logs_created_at ON public.location_detection_logs(created_at);