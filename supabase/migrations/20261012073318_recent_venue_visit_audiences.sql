-- Ninety-day venue memories, without coordinates. Audience is frozen at the
-- first live sharing moment. Never backfill old checkins using today's friends.
create table spotted_private.venue_visits (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 venue_id uuid not null references public.venues(id) on delete cascade,
 created_at timestamptz not null default now(),
 captured_at timestamptz,
 ended_at timestamptz,
 expires_at timestamptz not null default now()+interval '90 days'
);
create index venue_visits_owner on spotted_private.venue_visits(user_id,venue_id) where ended_at is null;
create index venue_visits_user on spotted_private.venue_visits(user_id);
create index venue_visits_venue on spotted_private.venue_visits(venue_id);
create index venue_visits_expiry on spotted_private.venue_visits(expires_at);
create table spotted_private.venue_visit_audience (
 visit_id uuid not null references spotted_private.venue_visits(id) on delete cascade,
 viewer_id uuid not null references auth.users(id) on delete cascade,
 primary key(visit_id,viewer_id)
);
create index venue_visit_audience_viewer on spotted_private.venue_visit_audience(viewer_id,visit_id);
alter table spotted_private.venue_visits enable row level security;
alter table spotted_private.venue_visit_audience enable row level security;
revoke all on spotted_private.venue_visits,spotted_private.venue_visit_audience from public,anon,authenticated;

create function spotted_private.capture_venue_visit(p_user uuid,p_venue uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v spotted_private.venue_visits; audience text;
begin
 select p.location_sharing_level into audience from public.profiles p join public.night_statuses s on s.user_id=p.id
 where p.id=p_user and not coalesce(p.is_demo,false) and not coalesce(s.is_demo,false)
 and s.status='out' and s.expires_at>now() and s.venue_id=p_venue and not coalesce(s.is_private_party,false);
 if not found then return; end if;
 for v in select * from spotted_private.venue_visits where user_id=p_user and venue_id=p_venue
   and captured_at is null and ended_at is null and created_at>now()-interval '12 hours' for update loop
  -- Candidate graph is bounded to direct and mutual relationships; the central
  -- authorizer still checks directional Close Friends, hidden people and blocks.
  insert into spotted_private.venue_visit_audience(visit_id,viewer_id)
  with direct as(select case when f.user_id=p_user then f.friend_id else f.user_id end id
   from public.friendships f where f.status='accepted' and (f.user_id=p_user or f.friend_id=p_user)),
  candidates as(select id from direct union select case when f.user_id=d.id then f.friend_id else f.user_id end
   from direct d join public.friendships f on (f.user_id=d.id or f.friend_id=d.id)
   where audience='mutual_friends' and f.status='accepted')
  select v.id,c.id from candidates c join public.profiles p on p.id=c.id
   where c.id<>p_user and not coalesce(p.is_demo,false)
   and spotted_private.location_audience(c.id,p_user,audience)
  on conflict do nothing;
  update spotted_private.venue_visits set captured_at=now(),expires_at=now()+interval '90 days' where id=v.id;
 end loop;
end $$;

create function spotted_private.track_venue_visit() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_table_name='checkins' then
  if tg_op='INSERT' and new.venue_id is not null and not coalesce(new.is_demo,false)
   and not coalesce(new.is_promoted,false) and new.ended_at is null
   and coalesce(new.started_at,now()) between now()-interval '5 minutes' and now()+interval '5 seconds' then
   insert into spotted_private.venue_visits(id,user_id,venue_id) values(new.id,new.user_id,new.venue_id) on conflict do nothing;
   perform spotted_private.capture_venue_visit(new.user_id,new.venue_id);
  elsif tg_op='UPDATE' and new.ended_at is not null then
   update spotted_private.venue_visits set ended_at=least(new.ended_at,now()) where id=new.id and ended_at is null;
  end if;
 else
  if tg_op='DELETE' then
   update spotted_private.venue_visits set ended_at=now() where user_id=old.user_id and ended_at is null;
  else
   update spotted_private.venue_visits set ended_at=now() where user_id=new.user_id and ended_at is null
    and (new.status<>'out' or new.expires_at<=now() or new.venue_id is distinct from venue_id or coalesce(new.is_private_party,false));
   if new.venue_id is not null then perform spotted_private.capture_venue_visit(new.user_id,new.venue_id); end if;
  end if;
 end if;
 return null;
end $$;
create trigger track_venue_visit after insert or update of ended_at on public.checkins for each row execute function spotted_private.track_venue_visit();
create trigger track_shared_venue_visit after insert or update or delete on public.night_statuses for each row execute function spotted_private.track_venue_visit();

create function spotted_private.recent_venue_visits(p_city text) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not spotted_private.launch_access() then raise exception 'Sign in to an admitted account' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
  select distinct on(v.venue_id,v.user_id) v.venue_id,v.user_id,p.display_name,p.avatar_url,v.expires_at
  from spotted_private.venue_visit_audience a join spotted_private.venue_visits v on v.id=a.visit_id
  join public.profiles p on p.id=v.user_id join public.venues place on place.id=v.venue_id
  where a.viewer_id=auth.uid() and v.user_id<>auth.uid() and v.captured_at is not null
   and v.ended_at is not null and v.expires_at>now() and place.city=p_city
   and not coalesce(p.is_demo,false) and not coalesce(place.is_demo,false)
   and spotted_private.location_audience(auth.uid(),v.user_id,p.location_sharing_level)
  order by v.venue_id,v.user_id,v.expires_at desc limit 1000
 )t),'[]'::jsonb);
end $$;
create function public.get_recent_venue_visits(p_city text) returns jsonb language sql set search_path='' as $$ select spotted_private.recent_venue_visits(p_city) $$;
create function spotted_private.cleanup_venue_visits() returns void language sql security definer set search_path='' as $$
 delete from spotted_private.venue_visits where expires_at<=now()
$$;
revoke all on function spotted_private.capture_venue_visit(uuid,uuid),spotted_private.track_venue_visit(),spotted_private.recent_venue_visits(text),spotted_private.cleanup_venue_visits(),public.get_recent_venue_visits(text) from public,anon,authenticated;
grant execute on function spotted_private.recent_venue_visits(text),public.get_recent_venue_visits(text) to authenticated;
-- Existing raw-coordinate checkin cleanup remains at 30 days.
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.schedule('cleanup-recent-venue-visits','40 10 * * *','select spotted_private.cleanup_venue_visits()');
 end if;
end $$;
