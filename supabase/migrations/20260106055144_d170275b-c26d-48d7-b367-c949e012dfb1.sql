-- Add columns to track auto-corrections in venue_location_reports
ALTER TABLE venue_location_reports 
ADD COLUMN IF NOT EXISTS auto_correction_id UUID,
ADD COLUMN IF NOT EXISTS auto_corrected_at TIMESTAMPTZ;

-- Create table to log automatic corrections
CREATE TABLE IF NOT EXISTS venue_auto_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) NOT NULL,
  old_lat DOUBLE PRECISION NOT NULL,
  old_lng DOUBLE PRECISION NOT NULL,
  new_lat DOUBLE PRECISION NOT NULL,
  new_lng DOUBLE PRECISION NOT NULL,
  report_count INTEGER NOT NULL,
  unique_user_count INTEGER NOT NULL,
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE venue_auto_corrections ENABLE ROW LEVEL SECURITY;

-- Admin can view all auto-corrections
CREATE POLICY "Admins can view auto corrections"
ON venue_auto_corrections FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update (for reverting)
CREATE POLICY "Admins can update auto corrections"
ON venue_auto_corrections FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Create function to check and auto-correct venue coordinates
CREATE OR REPLACE FUNCTION check_and_auto_correct_venue()
RETURNS TRIGGER AS $$
DECLARE
  report_count INTEGER;
  unique_users INTEGER;
  avg_lat DOUBLE PRECISION;
  avg_lng DOUBLE PRECISION;
  old_venue_lat DOUBLE PRECISION;
  old_venue_lng DOUBLE PRECISION;
  correction_id UUID;
  min_reports INTEGER := 3;
  max_age_hours INTEGER := 72;
BEGIN
  -- Only process wrong_location reports that are pending
  IF NEW.report_type != 'wrong_location' OR NEW.venue_id IS NULL OR NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Count recent reports for this venue from unique users
  SELECT 
    COUNT(*),
    COUNT(DISTINCT user_id),
    AVG(user_lat),
    AVG(user_lng)
  INTO report_count, unique_users, avg_lat, avg_lng
  FROM venue_location_reports
  WHERE venue_id = NEW.venue_id
    AND report_type = 'wrong_location'
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '72 hours';

  -- Need at least 3 reports from 2+ unique users
  IF report_count >= min_reports AND unique_users >= 2 THEN
    -- Get current venue coordinates
    SELECT lat, lng INTO old_venue_lat, old_venue_lng
    FROM venues WHERE id = NEW.venue_id;

    -- Generate correction ID
    correction_id := gen_random_uuid();

    -- Log the auto-correction
    INSERT INTO venue_auto_corrections 
      (id, venue_id, old_lat, old_lng, new_lat, new_lng, report_count, unique_user_count)
    VALUES 
      (correction_id, NEW.venue_id, old_venue_lat, old_venue_lng, avg_lat, avg_lng, report_count, unique_users);

    -- Update venue coordinates
    UPDATE venues 
    SET lat = avg_lat, lng = avg_lng
    WHERE id = NEW.venue_id;

    -- Mark all related reports as auto-corrected
    UPDATE venue_location_reports
    SET 
      status = 'auto_corrected',
      auto_correction_id = correction_id,
      auto_corrected_at = NOW()
    WHERE venue_id = NEW.venue_id
      AND report_type = 'wrong_location'
      AND status = 'pending'
      AND created_at > NOW() - INTERVAL '72 hours';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to run on new reports
DROP TRIGGER IF EXISTS trigger_auto_correct_venue ON venue_location_reports;
CREATE TRIGGER trigger_auto_correct_venue
AFTER INSERT ON venue_location_reports
FOR EACH ROW
EXECUTE FUNCTION check_and_auto_correct_venue();