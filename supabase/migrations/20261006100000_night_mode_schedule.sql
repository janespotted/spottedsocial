-- Day Mode / Night Mode (client brief, Oct 2026; mobile/DAY-NIGHT-MODE-PLAN.md).
-- Night Mode opens per weekday in the profile city's zone (Mon–Thu 6 PM,
-- Fri 4 PM, Sat noon, Sun 3 PM) and closes at the 5 AM reset. Before opening,
-- going Out / TBD / Stop sharing, Meet Ups and venue invites are refused.
--
-- Rollout: the guards ship OFF. spotted_private.night_mode_settings.enforced
-- stays false until the Day Mode build is released, so current builds keep
-- working at any hour. Tester accounts (spotted_private.night_mode_testers,
-- added by SQL only) can force Day or Night for themselves, and the server
-- honours it, so the guards can be tested before they are switched on.
begin;

create table spotted_private.night_mode_settings(
 id boolean primary key default true check(id),
 enforced boolean not null default false
);
insert into spotted_private.night_mode_settings default values;
alter table spotted_private.night_mode_settings enable row level security;
revoke all on spotted_private.night_mode_settings from public,anon,authenticated;

create table spotted_private.night_mode_testers(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 override text check(override in ('day','night')),
 note text,
 created_at timestamptz not null default now()
);
alter table spotted_private.night_mode_testers enable row level security;
revoke all on spotted_private.night_mode_testers from public,anon,authenticated;

-- The night is keyed by its 5 AM start, so 1 AM Saturday is still Friday night.
-- Client twin: nightModeOpensAt() in mobile/src/lib/tonight.ts.
create or replace function public.night_mode_opens_at(p_city text,p_at timestamptz default now())
returns timestamptz language sql stable set search_path='' as $$
 select (x.d+make_interval(hours=>case extract(isodow from x.d)::int
   when 5 then 16 when 6 then 12 when 7 then 15 else 18 end)) at time zone x.tz
 from (select z.tz,((p_at at time zone z.tz)-interval '5 hours')::date::timestamp d
  from (select case p_city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi'
   else 'America/New_York' end tz) z) x
$$;

create or replace function public.is_night_mode(p_city text,p_at timestamptz default now())
returns boolean language sql stable set search_path='' as $$
 select p_at>=public.night_mode_opens_at(p_city,p_at)
$$;
revoke all on function public.night_mode_opens_at(text,timestamptz),public.is_night_mode(text,timestamptz) from public,anon;
grant execute on function public.night_mode_opens_at(text,timestamptz),public.is_night_mode(text,timestamptz) to authenticated,service_role;

-- Whether Night Mode is open for this user: a tester's override, else the clock.
create or replace function spotted_private.night_mode_open_for(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  (select t.override='night' from spotted_private.night_mode_testers t where t.user_id=p_user and t.override is not null),
  public.is_night_mode((select p.city from public.profiles p where p.id=p_user)))
$$;

-- Whether a Night-Mode-only action must be refused. Testers' overrides apply
-- even while enforcement is off, so the refusal itself can be tested.
create or replace function spotted_private.night_mode_blocks(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case (select t.override from spotted_private.night_mode_testers t where t.user_id=p_user)
  when 'night' then false
  when 'day' then true
  else (select s.enforced from spotted_private.night_mode_settings s)
   and not public.is_night_mode((select p.city from public.profiles p where p.id=p_user))
 end
$$;

-- "Meet ups open when Night Mode starts at 6 PM." in the user's city.
create or replace function spotted_private.night_mode_message(p_user uuid,p_what text)
returns text language sql stable security definer set search_path='' as $$
 select p_what||' open when Night Mode starts at '||
  to_char(public.night_mode_opens_at(p.city) at time zone case p.city when 'la' then 'America/Los_Angeles'
   when 'lhr' then 'Asia/Karachi' else 'America/New_York' end,'FMHH12 AM')||'.'
 from public.profiles p where p.id=p_user
$$;

-- What the app needs to agree with the server: the override, if any.
create or replace function public.get_night_mode()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); c text; t spotted_private.night_mode_testers;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 select city into c from public.profiles where id=me;
 select * into t from spotted_private.night_mode_testers where user_id=me;
 return jsonb_build_object(
  'city',coalesce(c,'nyc'),
  'opens_at',public.night_mode_opens_at(c),
  'open',spotted_private.night_mode_open_for(me),
  'enforced',(select enforced from spotted_private.night_mode_settings),
  'tester',t.user_id is not null,
  'override',t.override);
end $$;

-- Testers only: 'auto' clears the override.
create or replace function public.set_night_mode_override(p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if p_mode is null or p_mode not in ('auto','day','night') then raise exception 'Invalid mode';end if;
 update spotted_private.night_mode_testers set override=nullif(p_mode,'auto') where user_id=me;
 if not found then raise exception 'Not a tester account' using errcode='42501';end if;
 return public.get_night_mode();
end $$;
revoke all on function public.get_night_mode(),public.set_night_mode_override(text) from public,anon;
grant execute on function public.get_night_mode(),public.set_night_mode_override(text) to authenticated;

-- Out / TBD / Stop sharing open with Night Mode. A trigger, not a check in
-- commit_night_status, because upsert_own_night_status and direct table
-- writes reach this table too. 'home' (In) and the reset's writes are always
-- allowed; demo rows are seeded data.
create or replace function spotted_private.guard_night_mode_status()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status::text in ('out','planning','off')
  and (tg_op='INSERT' or old.status is distinct from new.status)
  and not coalesce(new.is_demo,false)
  and spotted_private.night_mode_blocks(new.user_id) then
  raise exception '%',spotted_private.night_mode_message(new.user_id,'Out and TBD') using errcode='P0001',hint='night_mode_closed';
 end if;
 return new;
end $$;
create trigger guard_night_mode_status before insert or update of status on public.night_statuses
 for each row execute function spotted_private.guard_night_mode_status();

-- Meet Ups and venue invites are "right now" requests: Night Mode only.
-- Bodies are 20261005140000 plus the guard after the auth check.
create or replace function public.send_venue_invites(p_venue_id uuid,p_receivers uuid[])
returns table(invite_id uuid,receiver_id uuid,thread_id uuid,created boolean)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid(); v public.venues; r uuid; expiry timestamptz; existing public.invites; made public.invites;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if spotted_private.night_mode_blocks(me) then
  raise exception '%',spotted_private.night_mode_message(me,'Venue invites') using errcode='P0001',hint='night_mode_closed';end if;
 if cardinality(coalesce(p_receivers,'{}'))=0 or cardinality(p_receivers)>50 then raise exception 'Choose 1 to 50 friends';end if;
 select * into v from public.venues where id=p_venue_id;
 if v.id is null then raise exception 'Venue unavailable';end if;
 expiry:=spotted_private.next_reset_at(me);
 if expiry is null then raise exception 'Account unavailable';end if;
 for r in select distinct u from unnest(p_receivers) u where u is not null and u<>me loop
  if not spotted_private.invite_allowed('venue',me,r) then continue;end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text||r::text||v.id::text,43));
  -- Double tap only: the same venue to the same friend seconds ago
  select * into existing from public.invites i where i.kind='venue' and i.sender_id=me and i.receiver_id=r
   and i.venue_id=v.id and i.status='pending' and i.created_at>now()-interval '30 seconds'
   order by i.created_at desc limit 1;
  if existing.id is not null then
   invite_id:=existing.id;receiver_id:=r;thread_id:=existing.thread_id;created:=false;return next;continue;
  end if;
  made:=spotted_private.post_invite('venue',me,r,v.id,v.name,expiry);
  invite_id:=made.id;receiver_id:=r;thread_id:=made.thread_id;created:=true;return next;
 end loop;
end $$;

create or replace function public.send_meetup(p_receiver uuid)
returns table(result text,invite_id uuid,thread_id uuid)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid(); existing public.invites; made public.invites; s public.night_statuses;
 v_venue_id uuid; v_venue_name text; expiry timestamptz;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if spotted_private.night_mode_blocks(me) then
  raise exception '%',spotted_private.night_mode_message(me,'Meet ups') using errcode='P0001',hint='night_mode_closed';end if;
 if p_receiver is null or p_receiver=me or not spotted_private.invite_allowed('meetup',me,p_receiver) then
  raise exception 'This person is no longer available for this request.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_receiver::text,44));
 -- Double tap only: a request to them seconds ago is this request
 select * into existing from public.invites i where i.kind='meetup' and i.sender_id=me and i.receiver_id=p_receiver
  and i.status='pending' and i.created_at>now()-interval '30 seconds' order by i.created_at desc limit 1;
 if existing.id is not null then
  result:='sent';invite_id:=existing.id;thread_id:=existing.thread_id;return next;return;
 end if;
 -- Meet them where they are, when the sender may already see that spot.
 select * into s from public.night_statuses ns where ns.user_id=p_receiver and ns.status='out' and ns.expires_at>now()
  and ns.venue_id is not null and not coalesce(ns.is_private_party,false);
 if s.id is not null and spotted_private.location_audience(me,p_receiver,(select location_sharing_level from public.profiles where id=p_receiver)) then
  v_venue_id:=s.venue_id;
  v_venue_name:=coalesce(nullif(btrim(s.venue_name),''),(select name from public.venues where id=s.venue_id));
 end if;
 expiry:=spotted_private.next_reset_at(me);
 if expiry is null then raise exception 'Account unavailable';end if;
 made:=spotted_private.post_invite('meetup',me,p_receiver,v_venue_id,v_venue_name,expiry);
 result:='sent';invite_id:=made.id;thread_id:=made.thread_id;return next;
end $$;

revoke all on function public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid) from public,anon;
grant execute on function public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid) to authenticated;

-- New spotted_private helpers are internal; no blanket revoke here, so the
-- storage_key grant (CLAUDE.md migration hygiene) is untouched.
revoke all on function spotted_private.night_mode_open_for(uuid),spotted_private.night_mode_blocks(uuid),
 spotted_private.night_mode_message(uuid,text),spotted_private.guard_night_mode_status() from public,anon,authenticated;
commit;
