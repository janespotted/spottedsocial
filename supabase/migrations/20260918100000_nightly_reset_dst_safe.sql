-- ═════════════════════════════════════════════════════════════════════
-- Daylight-safe nightly reset schedule (addendum v3 §2).
--
-- pg_cron runs on UTC, so a fixed UTC time is only ever right for half the
-- year: '10 10 * * *' is 5:10 AM Eastern in standard time and 6:10 AM in
-- daylight time, so for ~8 months of the year the reset ran an hour late.
-- Rows carrying their own expires_at hide at read time regardless, but DMs
-- and notifications have no expiry column — they were the exposed ones.
--
-- Fix: schedule BOTH candidate hours per city and let the function decide.
-- nightly_reset() only ever acts on rows that are already expired, so the
-- early run is a no-op in the season it doesn't apply to, and every run is
-- idempotent. No server-side timezone maths, nothing to re-tune twice a
-- year.
--
--   ET: 09:10 UTC (5:10 EDT) and 10:10 UTC (5:10 EST)
--   PT: 12:10 UTC (5:10 PDT) and 13:10 UTC (5:10 PST)
--
-- The client is unaffected: it computes 5 AM in the profile city's zone
-- (mobile/src/lib/tonight.ts) and filters by expiry at read time.
-- ═════════════════════════════════════════════════════════════════════

do $outer$
begin
  perform cron.unschedule(jobid)
     from cron.job
    where jobname in (
      'nightly-reset-et', 'nightly-reset-pt',
      'nightly-reset-et-dst', 'nightly-reset-pt-dst'
    );
end
$outer$;

-- Eastern
select cron.schedule('nightly-reset-et-dst', '10 9 * * *',  $$select public.nightly_reset()$$);
select cron.schedule('nightly-reset-et',     '10 10 * * *', $$select public.nightly_reset()$$);
-- Pacific
select cron.schedule('nightly-reset-pt-dst', '10 12 * * *', $$select public.nightly_reset()$$);
select cron.schedule('nightly-reset-pt',     '10 13 * * *', $$select public.nightly_reset()$$);
