-- Close all orphaned checkins older than 48 hours that were never ended
UPDATE public.checkins
SET ended_at = started_at + INTERVAL '6 hours'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '48 hours';