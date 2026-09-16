-- ═════════════════════════════════════════════════════════════════════
-- Nightly reset — SQL-native, scheduled with pg_cron.
--
-- "Tonight" is per city: 5:00 AM in the city's own zone
-- (nyc → America/New_York, la → America/Los_Angeles). This is the same
-- definition the mobile client uses (mobile/src/lib/tonight.ts).
--
-- Why this replaces the pg_cron → pg_net → edge-function design of
-- 20260318050000_daily_cleanup_cron.sql: on the current project pg_cron and
-- pg_net were never installed, invoke_daily_cleanup() did not exist and Vault
-- held no service key, so that pipeline never ran once. This version has no
-- HTTP hop, no secret and no project URL that can go stale. The daily-cleanup
-- edge function stays deployed for manual runs only.
--
-- Rules:
--   * Rows that carry their own expires_at (statuses, posts, yaps, plans) were
--     stamped by the client in the right zone → judged against now().
--   * Rows without one are judged against THEIR OWNER'S city night start
--     (DMs by sender, notifications by receiver, GPS pin by profile). Unknown
--     city → the earlier of the two boundaries, i.e. the conservative one.
--   * Runs shortly after each city's reset (10:10 UTC ≈ 5:10 ET,
--     13:10 UTC ≈ 5:10 PT; both an hour later in daylight time). Every step
--     is idempotent, so the second run is always safe for the first city.
-- ═════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Most recent 5 AM in the city's zone at (or before) p_at.
create or replace function public.night_start_at(p_city text, p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  with tz as (
    select case when p_city = 'la' then 'America/Los_Angeles' else 'America/New_York' end as name
  )
  select (
    ((p_at at time zone tz.name) - interval '5 hours')::date + time '05:00'
  ) at time zone tz.name
  from tz;
$$;

comment on function public.night_start_at(text, timestamptz) is
  'Start of the current night (5 AM) in the given city''s time zone. The one server-side definition of "tonight".';

create or replace function public.nightly_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  -- Earliest night start across supported cities: safe for anyone whose city is unknown.
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
  -- 1. Live pins: drop for anyone not validly out, or whose last fix predates their city's night.
  update profiles p
     set is_out = false,
         last_known_lat = null,
         last_known_lng = null,
         last_location_at = null
   where p.is_out = true
     and (
       not exists (
         select 1 from night_statuses s
          where s.user_id = p.id and s.status = 'out' and s.expires_at > v_now
       )
       or p.last_location_at < night_start_at(p.city, v_now)
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_locations', n);

  -- 2. Check-ins are open only while their user is validly out.
  update checkins c
     set ended_at = v_now
   where c.ended_at is null
     and not exists (
       select 1 from night_statuses s
        where s.user_id = c.user_id and s.status = 'out' and s.expires_at > v_now
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ended_checkins', n);

  -- 3. DMs expire at the SENDER's city reset (reactions cascade).
  delete from dm_messages m
   where m.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = m.sender_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_dms', n);

  -- 4. Expired night statuses → home with NO expiry. An unexpired row (any
  --    status, including home) means "answered tonight" to the opening
  --    prompt; clearing expires_at is what makes the question come back.
  update night_statuses
     set status = 'home',
         venue_name = null,
         venue_id = null,
         lat = null,
         lng = null,
         expires_at = null,
         is_private_party = false,
         party_neighborhood = null,
         party_address = null,
         planning_neighborhood = null,
         planning_venue_id = null,
         planning_venue_name = null,
         planning_visibility = null
   where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_statuses', n);

  -- 5–7. Rows with their own city-zoned expiry.
  delete from posts where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_posts', n);

  delete from yap_messages where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_yaps', n);

  delete from plans where expires_at < v_now;  -- plan_comments cascade
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_plans', n);

  -- 8. Notifications expire at the RECEIVER's city reset.
  delete from notifications x
   where x.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = x.receiver_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_notifications', n);

  raise notice '[nightly_reset] %', result;
  return result;
end;
$$;

-- Only the scheduler (postgres) may run it — never callable through the API.
revoke all on function public.nightly_reset() from public, anon, authenticated;

comment on function public.nightly_reset() is
  'Per-city 5 AM reset: ends stale check-ins, clears pins and expired statuses, deletes expired posts/yaps/plans/DMs/notifications. Scheduled by pg_cron after each city''s reset.';

-- Replace any earlier schedule names, then schedule after each city's reset.
do $outer$
begin
  perform cron.unschedule(jobid)
     from cron.job
    where jobname in ('daily-cleanup', 'daily-cleanup-pacific', 'nightly-reset-et', 'nightly-reset-pt');
end
$outer$;

select cron.schedule('nightly-reset-et', '10 10 * * *', $$select public.nightly_reset()$$);
select cron.schedule('nightly-reset-pt', '10 13 * * *', $$select public.nightly_reset()$$);
