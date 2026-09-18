-- ═════════════════════════════════════════════════════════════════════
-- Lahore as a demo city (dev/QA only).
--
-- The developer is Lahore-based and cannot exercise venue detection,
-- arrival prompts or the map against New York venues. Lahore is therefore
-- a real city for the night-boundary maths, but its venues are seeded with
-- is_demo = true so they are invisible to anyone who has not switched demo
-- mode on. Jane and any real beta user continue to see NYC / LA / PB only.
--
-- Time zone matters: Asia/Karachi is UTC+5 with NO daylight saving, so a
-- Lahore night runs 5:00 AM → 5:00 AM PKT, which is midnight → midnight
-- UTC. Without this the client would expire Lahore content on New York's
-- clock — ten hours out.
-- ═════════════════════════════════════════════════════════════════════

create or replace function public.night_start_at(p_city text, p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  with tz as (
    select case
      when p_city = 'la' then 'America/Los_Angeles'
      when p_city = 'lhr' then 'Asia/Karachi'
      else 'America/New_York'
    end as name
  )
  select (
    ((p_at at time zone tz.name) - interval '5 hours')::date + time '05:00'
  ) at time zone tz.name
  from tz;
$$;

comment on function public.night_start_at(text, timestamptz) is
  'Start of the current night (5 AM) in the given city''s time zone — nyc, la, pb (Eastern) and lhr (Asia/Karachi, dev-only demo city). The one server-side definition of "tonight".';

-- Lahore's 5 AM is 00:00 UTC, so the reset needs its own cron slot. Every
-- step of nightly_reset() is expiry-gated and idempotent, so an extra run
-- is a no-op for the other cities.
do $outer$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'nightly-reset-lhr';
exception when others then null;
end $outer$;

select cron.schedule('nightly-reset-lhr', '10 0 * * *', $$select public.nightly_reset()$$);
