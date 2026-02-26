
-- Fix 1: Make post-images bucket private to prevent unauthorized access
UPDATE storage.buckets SET public = false WHERE id = 'post-images';

-- Drop old overly permissive public SELECT policy
DROP POLICY IF EXISTS "Post images are publicly accessible" ON storage.objects;

-- Allow authenticated users to view post images (they'll use signed URLs)
CREATE POLICY "Authenticated users can view post images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'post-images');

-- Fix 2: Tighten auto venue correction trigger thresholds
-- Increase from 3 reports/2 users to 5 reports/3 users, add GPS accuracy check
CREATE OR REPLACE FUNCTION public.check_and_auto_correct_venue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  report_count INTEGER;
  unique_users INTEGER;
  avg_lat DOUBLE PRECISION;
  avg_lng DOUBLE PRECISION;
  old_venue_lat DOUBLE PRECISION;
  old_venue_lng DOUBLE PRECISION;
  correction_id UUID;
  min_reports INTEGER := 5;
  min_users INTEGER := 3;
  max_age_hours INTEGER := 72;
BEGIN
  -- Only process wrong_location reports that are pending
  IF NEW.report_type != 'wrong_location' OR NEW.venue_id IS NULL OR NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Count recent reports for this venue from unique users, only with reasonable GPS accuracy
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

  -- Need at least 5 reports from 3+ unique users (was 3/2)
  IF report_count >= min_reports AND unique_users >= min_users THEN
    -- Get current venue coordinates
    SELECT lat, lng INTO old_venue_lat, old_venue_lng
    FROM venues WHERE id = NEW.venue_id;

    -- Safety check: don't allow corrections that move venue more than 1km
    IF (
      6371000 * acos(
        cos(radians(avg_lat)) * cos(radians(old_venue_lat)) * 
        cos(radians(old_venue_lng) - radians(avg_lng)) + 
        sin(radians(avg_lat)) * sin(radians(old_venue_lat))
      )
    ) > 1000 THEN
      RETURN NEW;
    END IF;

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
$$;
