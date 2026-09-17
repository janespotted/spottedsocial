-- Applied directly to the linked project on 2026-09-16 (outside this repo);
-- copied from supabase_migrations.schema_migrations so local history matches.

create or replace function internal.recompute_venue_leaderboard(p_city text default null)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  with eligible as (
    select
      v.id as venue_id,
      v.city,
      v.google_rating::numeric as google_rating,
      coalesce(v.google_user_ratings_total, 0) as google_reviews
    from public.venues v
    where coalesce(v.is_demo, false) = false
      and v.city is not null
      and (p_city is null or v.city = p_city)
  ),
  active_signals as (
    select
      s.venue_id,
      s.source,
      s.score::numeric as score,
      s.weight::numeric as base_weight,
      s.mention_count,
      s.observed_at,
      case s.source
        when 'x' then 3.0
        when 'reddit' then 7.0
        when 'editorial' then 30.0
        when 'google' then 90.0
        when 'manual' then 30.0
        else 14.0
      end as half_life_days
    from public.venue_signal_events s
    join eligible e on e.venue_id = s.venue_id
    where (s.expires_at is null or s.expires_at > now())
      and s.observed_at <= now()
  ),
  decayed as (
    select
      venue_id,
      source,
      score,
      mention_count,
      base_weight * exp(
        -ln(2::numeric) * greatest(extract(epoch from (now() - observed_at)) / 86400.0, 0) / half_life_days
      ) as effective_weight
    from active_signals
  ),
  per_source as (
    select
      venue_id,
      source,
      sum(score * effective_weight) / nullif(sum(effective_weight), 0) as source_score,
      sum(effective_weight) as source_weight,
      sum(mention_count) as mentions
    from decayed
    where effective_weight > 0.001
    group by venue_id, source
  ),
  buzz as (
    select
      venue_id,
      sum(source_score * source_weight) / nullif(sum(source_weight), 0) as raw_buzz_score,
      least(1.0, sum(source_weight) / 1.5) as internet_confidence,
      count(*)::integer as source_count,
      jsonb_object_agg(
        source,
        jsonb_build_object(
          'score', round(source_score, 1),
          'weight', round(source_weight, 2),
          'mentions', mentions
        )
      ) as source_breakdown
    from per_source
    where source <> 'google'
    group by venue_id
  ),
  google_quality as (
    select
      e.*,
      case
        when e.google_rating is null then 50.0
        else least(
          90.0,
          greatest(
            30.0,
            50.0
              + ((e.google_rating - 4.0) * 25.0)
              + least(10.0, ln(1.0 + greatest(e.google_reviews, 0)) * 1.5)
          )
        )
      end as google_quality_score
    from eligible e
  ),
  internet as (
    select
      g.venue_id,
      g.city,
      g.google_quality_score,
      coalesce(b.internet_confidence, 0.0) as internet_confidence,
      coalesce(b.source_count, 0) as source_count,
      coalesce(b.source_breakdown, '{}'::jsonb) || jsonb_build_object(
        'google', jsonb_build_object(
          'score', round(g.google_quality_score, 1),
          'rating', g.google_rating,
          'reviews', g.google_reviews
        )
      ) as source_breakdown,
      case
        when b.raw_buzz_score is null then
          50.0 + 0.15 * (g.google_quality_score - 50.0)
        else
          0.90 * (50.0 + b.internet_confidence * (b.raw_buzz_score - 50.0))
          + 0.10 * g.google_quality_score
      end as internet_score
    from google_quality g
    left join buzz b on b.venue_id = g.venue_id
  ),
  checkin_counts as (
    select
      e.venue_id,
      count(distinct c.user_id) filter (
        where c.created_at >= now() - interval '24 hours'
      )::integer as unique_24h,
      count(distinct c.user_id) filter (
        where c.created_at >= now() - interval '7 days'
      )::integer as unique_7d
    from eligible e
    left join public.checkins c
      on c.venue_id = e.venue_id
      and coalesce(c.is_demo, false) = false
      and c.created_at >= now() - interval '7 days'
    group by e.venue_id
  ),
  checkin_rank as (
    select
      venue_id,
      unique_24h,
      unique_7d,
      percent_rank() over (
        order by ((unique_24h * 3) + unique_7d)
      ) as activity_percentile
    from checkin_counts
  ),
  checkin_scored as (
    select
      venue_id,
      unique_24h,
      unique_7d,
      50.0 +
        (unique_7d::numeric / (unique_7d + 8.0)) *
        ((activity_percentile * 100.0) - 50.0) as checkin_score
    from checkin_rank
  ),
  computed as (
    select
      i.venue_id,
      i.city,
      least(100.0, greatest(0.0, i.internet_score)) as internet_score,
      least(100.0, greatest(0.0, c.checkin_score)) as checkin_score,
      least(
        100.0,
        greatest(
          0.0,
          0.75 * least(100.0, greatest(0.0, i.internet_score))
          + 0.25 * least(100.0, greatest(0.0, c.checkin_score))
        )
      ) as final_score,
      i.internet_confidence,
      c.unique_24h,
      c.unique_7d,
      i.source_count,
      i.source_breakdown,
      case
        when c.unique_24h >= 3 and c.checkin_score >= 70 then 'Trending tonight'
        when i.internet_score >= 72 and i.internet_confidence >= 0.35 then 'Hot right now'
        when c.unique_7d >= 3 then 'Popular on Spotted'
        else null
      end as trend_label
    from internet i
    join checkin_scored c on c.venue_id = i.venue_id
  )
  insert into public.venue_leaderboard_scores (
    venue_id,
    city,
    internet_score,
    checkin_score,
    final_score,
    internet_confidence,
    unique_checkins_24h,
    unique_checkins_7d,
    source_count,
    source_breakdown,
    trend_label,
    computed_at
  )
  select
    venue_id,
    city,
    round(internet_score, 2),
    round(checkin_score, 2),
    round(final_score, 2),
    round(internet_confidence, 4),
    unique_24h,
    unique_7d,
    source_count,
    source_breakdown,
    trend_label,
    now()
  from computed
  on conflict (venue_id) do update set
    city = excluded.city,
    internet_score = excluded.internet_score,
    checkin_score = excluded.checkin_score,
    final_score = excluded.final_score,
    internet_confidence = excluded.internet_confidence,
    unique_checkins_24h = excluded.unique_checkins_24h,
    unique_checkins_7d = excluded.unique_checkins_7d,
    source_count = excluded.source_count,
    source_breakdown = excluded.source_breakdown,
    trend_label = excluded.trend_label,
    computed_at = excluded.computed_at;
end;
$$;

revoke all on function internal.recompute_venue_leaderboard(text) from public, anon, authenticated;
