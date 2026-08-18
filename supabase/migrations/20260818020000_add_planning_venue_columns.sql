-- Add optional "considering" venue columns to night_statuses for TBD/planning status.
-- These are DISTINCT from venue_id/venue_name (which mean "actually checked in").
-- A planning_venue means "thinking about going here" — NOT a check-in.

ALTER TABLE night_statuses
  ADD COLUMN IF NOT EXISTS planning_venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_venue_name text;

-- No column-level SELECT revoke needed — these columns inherit the existing
-- night_statuses RLS policies. The can_see_planning gate already covers the
-- entire row for status='planning' rows.
