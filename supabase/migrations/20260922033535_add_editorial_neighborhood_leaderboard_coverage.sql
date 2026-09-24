-- Public editorial attribution only; raw collector signals remain private.
create table if not exists public.venue_editorial_recommendations (
  venue_id uuid not null references public.venues(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  publisher text not null,
  source_title text not null,
  published_at date not null,
  verified_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (venue_id, source_url)
);
alter table public.venue_editorial_recommendations enable row level security;
create policy "Authenticated users read editorial recommendations"
on public.venue_editorial_recommendations for select to authenticated using (active);
grant select on public.venue_editorial_recommendations to authenticated;
grant all on public.venue_editorial_recommendations to service_role;

create table if not exists public.leaderboard_neighborhoods (
  city text not null check (city in ('nyc','la')),
  name text not null,
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  included_neighborhoods text[] not null,
  primary key (city, name)
);
alter table public.leaderboard_neighborhoods enable row level security;
create policy "Authenticated users read leaderboard neighborhoods"
on public.leaderboard_neighborhoods for select to authenticated using (true);
grant select on public.leaderboard_neighborhoods to authenticated;
grant all on public.leaderboard_neighborhoods to service_role;

-- Coordinates are search centers, not claims about official boundary polygons.
insert into public.leaderboard_neighborhoods (city,name,center_lat,center_lng,included_neighborhoods) values
('la','West Hollywood',34.0900,-118.3780,array['West Hollywood']),
('la','Hollywood',34.1016,-118.3267,array['Hollywood']),
('la','Downtown LA',34.0445,-118.2515,array['Downtown LA','Downtown Los Angeles','DTLA','Downtown Historic Core','Arts District','Little Tokyo']),
('la','Santa Monica',34.0195,-118.4912,array['Santa Monica']),
('la','Venice',33.9925,-118.4660,array['Venice']),
('la','Silver Lake',34.0869,-118.2702,array['Silver Lake']),
('nyc','Lower East Side',40.7185,-73.9889,array['Lower East Side']),
('nyc','East Village',40.7265,-73.9815,array['East Village','Alphabet City']),
('nyc','West Village',40.7340,-74.0048,array['West Village']),
('nyc','Greenwich Village',40.7320,-73.9980,array['Greenwich Village']),
('nyc','NoHo',40.7287,-73.9926,array['NoHo']),
('nyc','SoHo',40.7233,-74.0030,array['SoHo']),
('nyc','Meatpacking',40.7400,-74.0076,array['Meatpacking']),
('nyc','Chelsea',40.7465,-74.0014,array['Chelsea']),
('nyc','Flatiron',40.7411,-73.9897,array['Flatiron']),
('nyc','Gramercy',40.7368,-73.9845,array['Gramercy']),
('nyc','NoMad',40.7440,-73.9880,array['NoMad','Nomad']),
('nyc','Hudson Square',40.7266,-74.0086,array['Hudson Square']),
('nyc','Midtown',40.7549,-73.9840,array['Midtown','Midtown West']),
('nyc','Midtown East',40.7545,-73.9680,array['Midtown East']),
('nyc','Financial District',40.7075,-74.0105,array['Financial District']),
('nyc','Dimes Square',40.7143,-73.9905,array['Dimes Square']),
('nyc','Downtown Brooklyn',40.6924,-73.9866,array['Downtown Brooklyn']),
('nyc','Williamsburg',40.7145,-73.9565,array['Williamsburg']),
('nyc','Greenpoint',40.7305,-73.9546,array['Greenpoint']),
('nyc','Bushwick',40.6990,-73.9230,array['Bushwick']),
('nyc','Ridgewood',40.7044,-73.9018,array['Ridgewood']),
('nyc','Gowanus',40.6755,-73.9915,array['Gowanus']),
('nyc','Boerum Hill',40.6855,-73.9840,array['Boerum Hill']),
('nyc','Clinton Hill',40.6885,-73.9650,array['Clinton Hill']),
('nyc','Bed-Stuy',40.6872,-73.9418,array['Bed-Stuy','Bedford-Stuyvesant']),
('nyc','Astoria',40.7640,-73.9230,array['Astoria']),
('nyc','Harlem',40.8116,-73.9465,array['Harlem'])
on conflict (city,name) do update set center_lat=excluded.center_lat,center_lng=excluded.center_lng,included_neighborhoods=excluded.included_neighborhoods;

create or replace function public.get_neighborhood_venue_leaderboard(
  p_city text, p_neighborhood text, p_limit integer default 20
) returns table (
  venue_id uuid, name text, neighborhood text, venue_type text,
  lat double precision, lng double precision, google_rating numeric,
  google_user_ratings_total integer, internet_score numeric,
  checkin_score numeric, final_score numeric, unique_checkins_24h integer,
  unique_checkins_7d integer, trend_label text, source_count integer,
  computed_at timestamptz, is_nearby boolean, distance_miles double precision,
  location_label text, editorial_sources jsonb
) language sql stable security invoker set search_path = public, pg_catalog as $$
  with scope as (
    select * from public.leaderboard_neighborhoods
    where city=p_city and name=p_neighborhood
  ), editorial as (
    select r.venue_id, jsonb_agg(jsonb_build_object(
      'publisher',r.publisher,'title',r.source_title,'url',r.source_url,
      'published_at',r.published_at,'verified_at',r.verified_at
    ) order by r.published_at desc,r.source_url) as sources
    from public.venue_editorial_recommendations r
    join public.venues v on v.id=r.venue_id
    where r.active and r.published_at >= (current_date - interval '2 years')::date
      and v.city=p_city and v.leaderboard_eligible
    group by r.venue_id
  ), candidates as (
    select v.*, e.sources, not (v.neighborhood = any(n.included_neighborhoods)) as outside,
      3958.7613 * acos(least(1::double precision,greatest(-1::double precision,
        sin(radians(n.center_lat))*sin(radians(v.lat)) +
        cos(radians(n.center_lat))*cos(radians(v.lat))*cos(radians(v.lng-n.center_lng))
      ))) as distance
    from scope n join public.venues v on v.city=n.city
    join editorial e on e.venue_id=v.id
    where v.leaderboard_eligible and not coalesce(v.is_demo,false)
      and v.lat is not null and v.lng is not null
  )
  select v.id,v.name,v.neighborhood,v.type,v.lat,v.lng,v.google_rating,
    v.google_user_ratings_total,s.internet_score,s.checkin_score,s.final_score,
    coalesce(s.unique_checkins_24h,0),coalesce(s.unique_checkins_7d,0),s.trend_label,
    coalesce(s.source_count,0),s.computed_at,v.outside,v.distance,
    case when not v.outside then v.neighborhood
      when v.distance <= 2 then 'Nearby · ' || v.neighborhood
      else 'Elsewhere in ' || case when p_city='la' then 'LA' else 'NYC' end || ' · ' || v.neighborhood end,
    v.sources
  from candidates v left join public.venue_leaderboard_scores s on s.venue_id=v.id
  order by v.outside,
    case when v.outside then v.distance end asc,
    s.final_score desc nulls last, s.internet_score desc nulls last, v.name, v.id
  limit greatest(20,least(coalesce(p_limit,20),100));
$$;
revoke all on function public.get_neighborhood_venue_leaderboard(text,text,integer) from public, anon;
grant execute on function public.get_neighborhood_venue_leaderboard(text,text,integer) to authenticated,service_role;
comment on function public.get_neighborhood_venue_leaderboard(text,text,integer) is
'Recent, verified editorial bar/club picks. Local first; fills to 20 with distance-labeled city options. Does not claim 20 venues physically inside every neighborhood.';
