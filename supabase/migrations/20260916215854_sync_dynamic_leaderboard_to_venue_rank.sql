-- Applied directly to the linked project on 2026-09-16 (outside this repo);
-- copied from supabase_migrations.schema_migrations so local history matches.

create or replace function internal.sync_venue_popularity_rank(p_city text default null)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- Reset eligible venues in scope so stale manual ranks do not persist.
  update public.venues
  set popularity_rank = 999
  where coalesce(is_demo, false) = false
    and city is not null
    and (p_city is null or city = p_city);

  -- Write the dynamic leaderboard order back into the legacy field that
  -- existing clients already consume. Only venues with a meaningful signal
  -- or real Spotted activity receive a ranked position.
  with ranked as (
    select
      s.venue_id,
      row_number() over (
        partition by s.city
        order by
          s.final_score desc,
          s.internet_score desc,
          s.unique_checkins_24h desc,
          s.unique_checkins_7d desc,
          s.venue_id
      )::integer as dynamic_rank
    from public.venue_leaderboard_scores s
    join public.venues v on v.id = s.venue_id
    where coalesce(v.is_demo, false) = false
      and (p_city is null or s.city = p_city)
      and (
        s.source_count > 0
        or s.unique_checkins_7d > 0
      )
  )
  update public.venues v
  set popularity_rank = r.dynamic_rank
  from ranked r
  where v.id = r.venue_id;
end;
$$;

revoke all on function internal.sync_venue_popularity_rank(text) from public, anon, authenticated;

-- Run immediately for current data.
select internal.sync_venue_popularity_rank(null);

-- Keep the legacy rank field synchronized immediately after each 15-minute
-- score refresh. Replace any prior sync job with the same name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-venue-popularity-rank-15m') then
    perform cron.unschedule('sync-venue-popularity-rank-15m');
  end if;
end $$;

select cron.schedule(
  'sync-venue-popularity-rank-15m',
  '2-59/15 * * * *',
  $$select internal.sync_venue_popularity_rank(null);$$
);
