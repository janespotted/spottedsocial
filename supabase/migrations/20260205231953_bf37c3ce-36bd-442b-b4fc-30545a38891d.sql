-- Add is_demo flag for cleanup
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Add created_by to track who added the event
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- RLS: Venue owners can manage their events
CREATE POLICY "Venue owners can manage events" ON events
  FOR ALL TO authenticated
  USING (
    venue_id IS NOT NULL AND 
    public.is_venue_owner(auth.uid(), venue_id)
  )
  WITH CHECK (
    venue_id IS NOT NULL AND 
    public.is_venue_owner(auth.uid(), venue_id)
  );

-- RLS: Admins can manage all events
CREATE POLICY "Admins can manage all events" ON events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: Users can create events (but not is_demo ones)
CREATE POLICY "Users can create events" ON events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    created_by = auth.uid() AND
    (is_demo = false OR is_demo IS NULL)
  );

-- RLS: Users can update their own events
CREATE POLICY "Users can update own events" ON events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS: Users can delete their own events
CREATE POLICY "Users can delete own events" ON events
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());