-- Applied directly to the linked project on 2026-09-16 (outside this repo);
-- copied from supabase_migrations.schema_migrations so local history matches.

create schema if not exists internal;
revoke all on schema internal from public;
revoke all on schema internal from anon, authenticated;

create table public.venue_signal_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  source text not null check (source in ('x','reddit','editorial','google','manual','spotted_web')),
  signal_kind text not null default 'buzz',
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  weight numeric(6,3) not null default 1.0 check (weight > 0),
  mention_count integer not null default 1 check (mention_count >= 0),
  source_url text,
  source_title text,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_venue_signal_events_venue_observed
  on public.venue_signal_events (venue_id, observed_at desc);
create index idx_venue_signal_events_source_observed
  on public.venue_signal_events (source, observed_at desc);

alter table public.venue_signal_events enable row level security;
revoke all on table public.venue_signal_events from anon, authenticated;

create table public.venue_leaderboard_scores (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  city text not null,
  internet_score numeric(5,2) not null default 50,
  checkin_score numeric(5,2) not null default 50,
  final_score numeric(5,2) not null default 50,
  internet_confidence numeric(5,4) not null default 0,
  unique_checkins_24h integer not null default 0,
  unique_checkins_7d integer not null default 0,
  source_count integer not null default 0,
  source_breakdown jsonb not null default '{}'::jsonb,
  trend_label text,
  computed_at timestamptz not null default now()
);

create index idx_venue_leaderboard_scores_city_final
  on public.venue_leaderboard_scores (city, final_score desc, computed_at desc);

alter table public.venue_leaderboard_scores enable row level security;
create policy "Authenticated users can view venue leaderboard scores"
  on public.venue_leaderboard_scores
  for select
  to authenticated
  using (true);
grant select on public.venue_leaderboard_scores to authenticated;

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
      end::numeric as half_life_days
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
        -ln(2::numeric) * greatest((extract(epoch from (now() - observed_at)) / 86400.0)::numeric, 0::numeric) / half_life_days
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
      least(1.0::numeric, sum(source_weight) / 4.0::numeric) as internet_confidence,
      count(*)::integer as source_count,
      jsonb_object_agg(
        source,
        jsonb_build_object(
          'score', round(source_score::numeric, 1),
          'weight', round(source_weight::numeric, 2),
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
        when e.google_rating is null then 50.0::numeric
        else least(
          90.0::numeric,
          greatest(
            30.0::numeric,
            50.0::numeric
              + ((e.google_rating - 4.0::numeric) * 25.0::numeric)
              + least(10.0::numeric, ln(1.0::numeric + greatest(e.google_reviews, 0)::numeric) * 1.5::numeric)
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
      coalesce(b.internet_confidence, 0.0::numeric) as internet_confidence,
      coalesce(b.source_count, 0) as source_count,
      coalesce(b.source_breakdown, '{}'::jsonb) || jsonb_build_object(
        'google', jsonb_build_object(
          'score', round(g.google_quality_score::numeric, 1),
          'rating', g.google_rating,
          'reviews', g.google_reviews
        )
      ) as source_breakdown,
      case
        when b.raw_buzz_score is null then
          50.0::numeric + 0.35::numeric * (g.google_quality_score - 50.0::numeric)
        else
          0.85::numeric * (50.0::numeric + b.internet_confidence * (b.raw_buzz_score - 50.0::numeric))
          + 0.15::numeric * g.google_quality_score
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
      )::numeric as activity_percentile
    from checkin_counts
  ),
  checkin_scored as (
    select
      venue_id,
      unique_24h,
      unique_7d,
      50.0::numeric +
        (unique_7d::numeric / (unique_7d::numeric + 8.0::numeric)) *
        ((activity_percentile * 100.0::numeric) - 50.0::numeric) as checkin_score
    from checkin_rank
  ),
  computed as (
    select
      i.venue_id,
      i.city,
      least(100.0::numeric, greatest(0.0::numeric, i.internet_score)) as internet_score,
      least(100.0::numeric, greatest(0.0::numeric, c.checkin_score)) as checkin_score,
      least(
        100.0::numeric,
        greatest(
          0.0::numeric,
          0.75::numeric * least(100.0::numeric, greatest(0.0::numeric, i.internet_score))
          + 0.25::numeric * least(100.0::numeric, greatest(0.0::numeric, c.checkin_score))
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

create function public.get_venue_leaderboard(
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
      s.source_count > 0
      or s.unique_checkins_7d > 0
      or v.google_rating is not null
    )
  order by s.final_score desc, s.internet_score desc, v.name asc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_venue_leaderboard(text, integer) from public, anon;
grant execute on function public.get_venue_leaderboard(text, integer) to authenticated;

select internal.recompute_venue_leaderboard(null);

select cron.schedule(
  'recompute-venue-leaderboard-15m',
  '*/15 * * * *',
  $$select internal.recompute_venue_leaderboard(null);$$
);
