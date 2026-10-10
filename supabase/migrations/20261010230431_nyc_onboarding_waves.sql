-- Staged rollout: wave admission remains OFF until an operator enables it.
-- New-account profile + two nominations are mandatory immediately on deployment.
create schema if not exists spotted_private;
grant usage on schema spotted_private to authenticated;
create table spotted_private.launch_settings (
  singleton boolean primary key default true check(singleton),
  wave_gate boolean not null default false,
  created_at timestamptz not null default now()
);
insert into spotted_private.launch_settings(singleton) values(true);
create table spotted_private.launch_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admitted_at timestamptz not null default now(),
  profile_saved_at timestamptz,
  completed_at timestamptz,
  grandfathered boolean not null default false
);
-- Preserve current members; metadata and account age cannot grant this later.
insert into spotted_private.launch_members(user_id,profile_saved_at,completed_at,grandfathered)
select id,now(),now(),true from auth.users;
create table spotted_private.launch_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  city_tester boolean not null default false,
  wave_admin boolean not null default false
);
insert into spotted_private.launch_operators(user_id,city_tester,wave_admin)
select user_id,true,bool_or(admin) from (select user_id,false admin from spotted_private.night_mode_testers union all select user_id,true admin from public.user_roles where role::text='admin') x group by user_id
on conflict(user_id) do update set wave_admin=excluded.wave_admin or launch_operators.wave_admin;
create table spotted_private.launch_waves (
  id uuid primary key,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz not null default now(),
  invitation_count integer not null check(invitation_count between 0 and 500)
);
create table spotted_private.launch_nominations (
  id uuid primary key default gen_random_uuid(),
  nominated_by uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check(slot in (1,2)),
  phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  wave_id uuid references spotted_private.launch_waves(id),
  claimed_by uuid unique references auth.users(id) on delete set null,
  unique(nominated_by,slot)
);
create index launch_nominations_pending on spotted_private.launch_nominations(created_at,id) where wave_id is null;
create table spotted_private.launch_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table spotted_private.launch_settings enable row level security;
alter table spotted_private.launch_members enable row level security;
alter table spotted_private.launch_operators enable row level security;
alter table spotted_private.launch_waves enable row level security;
alter table spotted_private.launch_nominations enable row level security;
alter table spotted_private.launch_attempts enable row level security;
revoke all on spotted_private.launch_settings,spotted_private.launch_members,spotted_private.launch_operators,spotted_private.launch_waves,spotted_private.launch_nominations,spotted_private.launch_attempts from public,anon,authenticated;

create function spotted_private.launch_phone(value text) returns text
language sql immutable set search_path='' as $$
 select case when value ~ '^\+?[1-9][0-9]{7,14}$' then '+'||ltrim(value,'+') end
$$;
create function spotted_private.launch_access() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from spotted_private.launch_members
 where user_id=auth.uid() and completed_at is not null)
$$;
create function spotted_private.launch_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); own_phone text; gated boolean; m spotted_private.launch_members;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select wave_gate into gated from spotted_private.launch_settings where singleton;
 select spotted_private.launch_phone(phone) into own_phone from auth.users where id=u and phone_confirmed_at is not null;
 -- Claim is bound to the authenticated, verified phone, never an invite URL.
 if not gated then
   insert into spotted_private.launch_members(user_id) values(u) on conflict do nothing;
 elsif own_phone is not null then
   perform 1 from spotted_private.launch_nominations where phone=own_phone and wave_id is not null and (claimed_by is null or claimed_by=u) for update;
   if found then
     insert into spotted_private.launch_members(user_id) values(u) on conflict do nothing;
     update spotted_private.launch_nominations set claimed_by=u where phone=own_phone and wave_id is not null and claimed_by is null;
   end if;
 end if;
 select * into m from spotted_private.launch_members where user_id=u;
 return jsonb_build_object('admitted',m.user_id is not null,'profileSaved',m.profile_saved_at is not null,
 'complete',m.completed_at is not null,'hasPhone',own_phone is not null,
 'profile',(select jsonb_build_object('name',display_name,'username',username) from public.profiles where id=u),
 'cityTester',coalesce((select city_tester from spotted_private.launch_operators where user_id=u),false),
 'waveAdmin',coalesce((select wave_admin from spotted_private.launch_operators where user_id=u),false),
 'nominations',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'phone',phone,'activated',wave_id is not null) order by slot) from spotted_private.launch_nominations where nominated_by=u),'[]'::jsonb));
end $$;

create function spotted_private.save_launch_profile(p_name text,p_username text,p_terms boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s jsonb;
begin
 s:=spotted_private.launch_state();
 if not (s->>'admitted')::boolean then raise exception 'Your invitation is not active yet' using errcode='42501'; end if;
 if p_terms is distinct from true or length(btrim(p_name)) not between 1 and 50 or p_name is null
 or p_username is null or p_username !~ '^[a-z0-9_.]{3,20}$'
 or p_username=any(array['admin','support','spotted','anthropic','help','official','mod','moderator','system','staff','team','root','api']) then
 raise exception 'Check your name, username and terms agreement' using errcode='22023'; end if;
 update public.profiles set display_name=btrim(p_name),username=p_username,
 avatar_url=coalesce(avatar_url,'https://api.dicebear.com/9.x/adventurer/svg?seed='||p_username) where id=u;
 if not found then insert into public.profiles(id,display_name,username,city) values(u,btrim(p_name),p_username,'nyc'); end if;
 update spotted_private.launch_members set profile_saved_at=coalesce(profile_saved_at,now()) where user_id=u;
 return spotted_private.launch_state();
end $$;

create function spotted_private.save_launch_nomination(p_slot integer,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); normalized text:=spotted_private.launch_phone(p_phone); tries integer; m spotted_private.launch_members;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into m from spotted_private.launch_members where user_id=u for update;
 if m.user_id is null or m.profile_saved_at is null or m.completed_at is not null then raise exception 'This nomination cannot be changed' using errcode='42501'; end if;
 if p_slot is null or p_slot not in(1,2) or normalized is null then return jsonb_build_object('error','Enter a valid phone number with its country code.'); end if;
 if exists(select 1 from spotted_private.launch_nominations where nominated_by=u and slot=p_slot and phone=normalized) then return spotted_private.launch_state(); end if;
 insert into spotted_private.launch_attempts(user_id,attempts) values(u,1)
 on conflict(user_id) do update set attempts=case when launch_attempts.window_start<now()-interval '1 hour' then 1 else launch_attempts.attempts+1 end,
 window_start=case when launch_attempts.window_start<now()-interval '1 hour' then now() else launch_attempts.window_start end returning attempts into tries;
 if tries>30 then return jsonb_build_object('error','Too many checks. Your choices are saved; try again in an hour.'); end if;
 -- Generic response avoids revealing whether someone is a member or in the queue.
 if exists(select 1 from auth.users where spotted_private.launch_phone(phone)=normalized)
 or exists(select 1 from spotted_private.launch_nominations where phone=normalized) then
 return jsonb_build_object('error','This number is already on Spotted or the invite list. Choose someone else.'); end if;
 begin
 insert into spotted_private.launch_nominations(nominated_by,slot,phone) values(u,p_slot,normalized)
 on conflict(nominated_by,slot) do update set phone=excluded.phone,created_at=now();
 exception when unique_violation then return jsonb_build_object('error','This number is already on Spotted or the invite list. Choose someone else.');
 end;
 return spotted_private.launch_state();
end $$;

create function spotted_private.complete_launch_onboarding() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m spotted_private.launch_members;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into m from spotted_private.launch_members where user_id=u for update;
 if m.completed_at is not null then return spotted_private.launch_state(); end if;
 if m.user_id is null or m.profile_saved_at is null then raise exception 'Finish your profile first' using errcode='42501'; end if;
 if (select count(*) from spotted_private.launch_nominations where nominated_by=u)<>2 then
 raise exception 'Choose two people to continue' using errcode='22023'; end if;
 -- Recheck at the final boundary; pending selections never activate in a wave.
 if exists(select 1 from spotted_private.launch_nominations n join auth.users a on spotted_private.launch_phone(a.phone)=n.phone where n.nominated_by=u) then
 return jsonb_build_object('error','One of your choices has joined Spotted. Replace that number to continue.'); end if;
 update spotted_private.launch_members set completed_at=now() where user_id=u;
 return spotted_private.launch_state();
end $$;

create function spotted_private.launch_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from spotted_private.launch_operators where user_id=auth.uid() and wave_admin) then raise exception 'Not authorized' using errcode='42501'; end if;
 return jsonb_build_object('gated',(select wave_gate from spotted_private.launch_settings where singleton),
 'members',(select count(*) from spotted_private.launch_members),
 'pending',(select count(*) from spotted_private.launch_nominations n join spotted_private.launch_members m on m.user_id=n.nominated_by where m.completed_at is not null and n.wave_id is null),
 'activated',(select count(*) from spotted_private.launch_nominations where wave_id is not null and claimed_by is null),
 'waves',coalesce((select jsonb_agg(x order by activated_at desc) from (select id,activated_at,invitation_count from spotted_private.launch_waves order by activated_at desc limit 20)x),'[]'::jsonb));
end $$;
create function spotted_private.activate_launch_wave(p_request uuid,p_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 perform spotted_private.launch_dashboard();
 if p_request is null or p_count is null or p_count not between 1 and 500 then raise exception 'Choose between 1 and 500 invitations' using errcode='22023'; end if;
 perform 1 from spotted_private.launch_settings where singleton for update;
 if not (select wave_gate from spotted_private.launch_settings where singleton) then raise exception 'Enable controlled admission before opening a wave' using errcode='22023'; end if;
 if exists(select 1 from spotted_private.launch_waves where id=p_request) then return spotted_private.launch_dashboard(); end if;
 insert into spotted_private.launch_waves(id,activated_by,invitation_count) values(p_request,auth.uid(),0);
 with next_up as (
 select n.id from spotted_private.launch_nominations n join spotted_private.launch_members m on m.user_id=n.nominated_by
 where n.wave_id is null and m.completed_at is not null
 and not exists(select 1 from auth.users a join spotted_private.launch_members am on am.user_id=a.id where spotted_private.launch_phone(a.phone)=n.phone)
 order by n.created_at,n.id limit p_count for update of n
 ) update spotted_private.launch_nominations set wave_id=p_request where id in(select id from next_up);
 get diagnostics changed=row_count;
 update spotted_private.launch_waves set invitation_count=changed where id=p_request;
 -- Activation grants admission only. No text messages or automatic friendships.
 return spotted_private.launch_dashboard();
end $$;

create function spotted_private.guard_launch_city() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and coalesce(auth.role(),'')<>'service_role' then
   if tg_op='INSERT' then new.city:='nyc';
   elsif new.city is distinct from old.city and not exists(select 1 from spotted_private.launch_operators where user_id=auth.uid() and city_tester) then
     raise exception 'City changes are available to internal testers only' using errcode='42501';
   end if;
 end if;
 if new.city is null then new.city:='nyc'; end if;
 return new;
end $$;
alter table public.profiles alter column city set default 'nyc';
create trigger launch_city_guard before insert or update of city on public.profiles for each row execute function spotted_private.guard_launch_city();

-- Thin invoker endpoints. The private implementations validate identity/role.
create function public.get_launch_state() returns jsonb language sql set search_path='' as $$ select spotted_private.launch_state() $$;
create function public.save_launch_profile(p_name text,p_username text,p_terms boolean) returns jsonb language sql set search_path='' as $$ select spotted_private.save_launch_profile(p_name,p_username,p_terms) $$;
create function public.save_launch_nomination(p_slot integer,p_phone text) returns jsonb language sql set search_path='' as $$ select spotted_private.save_launch_nomination(p_slot,p_phone) $$;
create function public.complete_launch_onboarding() returns jsonb language sql set search_path='' as $$ select spotted_private.complete_launch_onboarding() $$;
create function public.get_launch_dashboard() returns jsonb language sql set search_path='' as $$ select spotted_private.launch_dashboard() $$;
create function public.activate_launch_wave(p_request uuid,p_count integer) returns jsonb language sql set search_path='' as $$ select spotted_private.activate_launch_wave(p_request,p_count) $$;

-- Table / Storage / Realtime reads remain gated even outside the REST hook.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname='public' or (schemaname='storage' and tablename='objects') loop
 execute format('create policy launch_admission on %I.%I as restrictive for all to authenticated using ((select spotted_private.launch_access())) with check ((select spotted_private.launch_access()))',t.schemaname,t.tablename);
 end loop;
end $$;
-- Cover existing SECURITY DEFINER RPCs as well as tables for old app builds.
create function public.check_launch_request() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text:=current_setting('request.path',true);
begin
 if auth.role()='authenticated' and not spotted_private.launch_access() and coalesce(endpoint,'') not in (
 '/rpc/get_launch_state','/rpc/save_launch_profile','/rpc/save_launch_nomination','/rpc/complete_launch_onboarding') then
 raise exception 'Finish onboarding to enter Spotted' using errcode='42501'; end if;
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='spotted_private' and p.proname in('launch_phone','launch_access','launch_state','save_launch_profile','save_launch_nomination','complete_launch_onboarding','launch_dashboard','activate_launch_wave','guard_launch_city'))
 or (n.nspname='public' and p.proname in('get_launch_state','save_launch_profile','save_launch_nomination','complete_launch_onboarding','get_launch_dashboard','activate_launch_wave','check_launch_request')) loop
 execute format('revoke all on function %s from public, anon, authenticated',f.signature);
 if f.signature::text not like '%guard_launch_city%' and f.signature::text not like '%launch_phone%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
-- Preserve any existing request hook rather than silently replacing it.
do $$ begin
 if exists(select 1 from pg_roles where rolname='authenticator') then
 if exists(select 1 from pg_roles r,unnest(r.rolconfig)c where r.rolname='authenticator' and c like 'pgrst.db_pre_request=%' and c<>'pgrst.db_pre_request=public.check_launch_request') then
 raise exception 'An existing PostgREST pre-request hook must be composed with check_launch_request'; end if;
 execute 'alter role authenticator set pgrst.db_pre_request = ''public.check_launch_request''';
 end if;
end $$;
notify pgrst,'reload config';
notify pgrst,'reload schema';

grant execute on function public.check_launch_request() to anon,service_role;
