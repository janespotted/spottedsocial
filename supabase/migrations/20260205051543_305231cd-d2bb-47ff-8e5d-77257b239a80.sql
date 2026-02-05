-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id),
  venue_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME,
  cover_image_url TEXT,
  ticket_url TEXT,
  city TEXT,
  neighborhood TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create event_rsvps table
CREATE TABLE public.event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rsvp_type TEXT NOT NULL DEFAULT 'interested' CHECK (rsvp_type IN ('interested', 'going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Enable RLS on both tables
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- Events: readable by all authenticated users
CREATE POLICY "Events are readable by authenticated users"
ON public.events
FOR SELECT
TO authenticated
USING (true);

-- Event RSVPs: users can read all RSVPs (to see friends' interest)
CREATE POLICY "RSVPs are readable by authenticated users"
ON public.event_rsvps
FOR SELECT
TO authenticated
USING (true);

-- Event RSVPs: users can insert their own
CREATE POLICY "Users can create their own RSVPs"
ON public.event_rsvps
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Event RSVPs: users can update their own
CREATE POLICY "Users can update their own RSVPs"
ON public.event_rsvps
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Event RSVPs: users can delete their own
CREATE POLICY "Users can delete their own RSVPs"
ON public.event_rsvps
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_events_venue_id ON public.events(venue_id);
CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_events_city ON public.events(city);
CREATE INDEX idx_event_rsvps_event_id ON public.event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user_id ON public.event_rsvps(user_id);