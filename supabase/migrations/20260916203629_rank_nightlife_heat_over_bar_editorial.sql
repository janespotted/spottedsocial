-- Applied directly to the linked project on 2026-09-16 (outside this repo);
-- copied from supabase_migrations.schema_migrations so local history matches.

update public.venue_signal_events
set signal_kind = 'nightlife_index'
where source = 'editorial'
  and (
    coalesce(source_url,'') ilike '%ra.co/%'
    or coalesce(source_url,'') ilike '%clubbable.com/%'
    or coalesce(source_url,'') ilike '%corner.inc/%'
    or lower(coalesce(source_title,'')) ~ '(popular clubs|best clubs|nightclubs|nightlife|clubs in new york|clubs in nyc)'
  );

update public.venue_signal_events
set signal_kind = 'bar_editorial'
where source = 'editorial'
  and signal_kind in ('curated_list','mention')
  and lower(coalesce(source_title,'')) ~ '(best bars|cocktail bars|bar hit list|where to drink|new bars)';

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
      v.type as venue_type,
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
      coalesce(nullif(s.signal_kind,''),'mention') as signal_kind,
      s.score::numeric as score,
      s.weight::numeric as base_weight,
      s.mention_count,
      s.observed_at,
      coalesce(
        nullif(regexp_replace(lower(coalesce(s.source_url,'')), '^https?://(www\.)?([^/]+).*$','\2'), ''),
        s.source
      ) as publisher,
      case
        when s.source = 'x' then 3.0
        when s.source = 'reddit' then 10.0
        when s.signal_kind = 'event_demand' then 7.0
        when s.signal_kind = 'social_buzz' then 5.0
        when s.signal_kind = 'community_buzz' then 10.0
        when s.signal_kind = 'nightlife_index' then 45.0
        when s.signal_kind = 'bar_editorial' then 30.0
        when s.source = 'editorial' then 21.0
        when s.source = 'manual' then 45.0
        else 14.0
      end as half_life_days,
      case
        when s.signal_kind = 'nightlife_index' then 1.55
        when s.signal_kind = 'event_demand' then 1.35
        when s.signal_kind = 'social_buzz' then 1.35
        when s.signal_kind = 'community_buzz' then 1.20
        when s.signal_kind = 'bar_editorial' then 0.45
        when s.signal_kind = 'curated_list' then 0.65
        when s.signal_kind = 'mention' then 0.55
        else 0.75
      end as kind_multiplier,
      case
        when s.source = 'x' then 1.15
        when s.source = 'reddit' then 1.05
        else 1.0
      end as source_multiplier
    from public.venue_signal_events s
    join eligible e on e.venue_id = s.venue_id
    where (s.expires_at is null or s.expires_at > now())
      and s.observed_at <= now()
  ),
  decayed as (
    select
      venue_id,
      source,
      signal_kind,
      publisher,
      score,
      mention_count,
      base_weight * kind_multiplier * source_multiplier * exp(
        -ln(2::numeric) * greatest(extract(epoch from (now() - observed_at)) / 86400.0, 0) / half_life_days
      ) as effective_weight
    from active_signals
  ),
  per_publisher as (
    select
      venue_id,
      publisher,
      sum(score * effective_weight) / nullif(sum(effective_weight), 0) as publisher_score,
      least(2.0::numeric, sum(effective_weight)) as publisher_weight,
      sum(mention_count)::integer as mentions,
      array_agg(distinct signal_kind) as signal_kinds,
      max(case when signal_kind in ('nightlife_index','event_demand','social_buzz','community_buzz') then 1 else 0 end)::integer as nightlife_relevant
    from decayed
    where effective_weight > 0.001
    group by venue_id, publisher
  ),
  buzz as (
    select
      venue_id,
      sum(publisher_score * publisher_weight) / nullif(sum(publisher_weight), 0) as raw_buzz_score,
      least(1.0::numeric, sum(publisher_weight) / 3.0) as internet_confidence,
      count(*)::integer as source_count,
      sum(nightlife_relevant)::integer as nightlife_source_count,
      jsonb_object_agg(
        publisher,
        jsonb_build_object(
          'score', round(publisher_score::numeric, 1),
          'weight', round(publisher_weight::numeric, 2),
          'mentions', mentions,
          'kinds', signal_kinds
        )
      ) as source_breakdown
    from per_publisher
    group by venue_id
  ),
  google_quality as (
    select
      e.*,
      case
        when e.google_rating is null then 50.0
        else least(
          65.0,
          greatest(
            40.0,
            50.0
              + ((e.google_rating - 4.0) * 10.0)
              + least(5.0, ln(1.0 + greatest(e.google_reviews, 0)))
          )
        )
      end as google_quality_score
    from eligible e
  ),
  internet as (
    select
      g.venue_id,
      g.city,
      g.venue_type,
      g.google_quality_score,
      coalesce(b.internet_confidence, 0.0) as internet_confidence,
      coalesce(b.source_count, 0) as source_count,
      coalesce(b.nightlife_source_count, 0) as nightlife_source_count,
      coalesce(b.source_breakdown, '{}'::jsonb) || jsonb_build_object(
        'google', jsonb_build_object(
          'score', round(g.google_quality_score::numeric, 1),
          'rating', g.google_rating,
          'reviews', g.google_reviews
        )
      ) as source_breakdown,
      case
        when b.raw_buzz_score is null then
          50.0 + 0.05 * (g.google_quality_score - 50.0)
        else
          0.95 * (50.0 + b.internet_confidence * (b.raw_buzz_score - 50.0))
          + 0.05 * g.google_quality_score
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
        when i.internet_score >= 78 and i.nightlife_source_count >= 2 then 'Hot right now'
        when c.unique_7d >= 3 then 'Popular on Spotted'
        when i.internet_score >= 72 and i.nightlife_source_count >= 1 then 'On the radar'
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
    round(internet_score::numeric, 2),
    round(checkin_score::numeric, 2),
    round(final_score::numeric, 2),
    round(internet_confidence::numeric, 4),
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

create or replace function public.get_venue_leaderboard(
  p_city text default 'nyc',
  p_limit integer default 20
)
returns table (
  venue_id uuid,
  name text,
  neighborhood text,
  venue_type text,
  lat double precision,
  lng double precision,
  google_rating numeric,
  google_user_ratings_total integer,
  internet_score numeric,
  checkin_score numeric,
  final_score numeric,
  unique_checkins_24h integer,
  unique_checkins_7d integer,
  trend_label text,
  source_count integer,
  computed_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    v.id,
    v.name,
    v.neighborhood,
    v.type,
    v.lat,
    v.lng,
    v.google_rating,
    v.google_user_ratings_total,
    s.internet_score,
    s.checkin_score,
    s.final_score,
    s.unique_checkins_24h,
    s.unique_checkins_7d,
    s.trend_label,
    s.source_count,
    s.computed_at
  from public.venue_leaderboard_scores s
  join public.venues v on v.id = s.venue_id
  where s.city = p_city
    and coalesce(v.is_demo, false) = false
    and (
      v.type in ('club','nightclub','members_club')
      or s.unique_checkins_7d > 0
      or exists (
        select 1
        from public.venue_signal_events vse
        where vse.venue_id = v.id
          and vse.observed_at >= now() - interval '60 days'
          and vse.signal_kind in ('nightlife_index','event_demand','social_buzz','community_buzz')
      )
    )
  order by s.final_score desc, s.internet_score desc, v.name asc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_venue_leaderboard(text, integer) from public, anon;
grant execute on function public.get_venue_leaderboard(text, integer) to authenticated;

select internal.recompute_venue_leaderboard(null);
