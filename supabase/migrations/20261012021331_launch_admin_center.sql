-- Additive admin controls. Admission and outbound messaging remain unchanged
-- until an operator explicitly enables them after reviewing the release.
alter table spotted_private.launch_settings
 add column require_phone boolean not null default false,
 add column install_url text,
 add column sms_enabled boolean not null default false;
alter table spotted_private.launch_waves
 add column name text not null default 'Invitation wave',
 add column capacity integer not null default 100 check(capacity between 1 and 500),
 add column status text not null default 'open' check(status in('draft','open','paused')),
 add column created_at timestamptz not null default now();
alter table spotted_private.launch_waves alter column activated_at drop not null;
update spotted_private.launch_waves set capacity=greatest(100,invitation_count);
create table spotted_private.launch_guests (
 id uuid primary key default gen_random_uuid(), phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 name text not null default '' check(length(name)<=80), source text not null check(source in('seed','nomination')),
 nomination_id uuid unique references spotted_private.launch_nominations(id) on delete set null,
 nominated_by uuid references auth.users(id) on delete set null,
 wave_id uuid references spotted_private.launch_waves(id),
 activated_at timestamptz, revoked_at timestamptz,
 claimed_by uuid unique references auth.users(id) on delete set null, claimed_at timestamptz,
 invited_at timestamptz, invited_via text check(invited_via in('manual','sms')),
 consent_at timestamptz, consent_note text check(length(consent_note)<=500), suppressed_at timestamptz,
 created_at timestamptz not null default now()
);
create index launch_guests_wave on spotted_private.launch_guests(wave_id,created_at,id);
create table spotted_private.launch_messages (
 id uuid primary key default gen_random_uuid(), guest_id uuid not null unique references spotted_private.launch_guests(id),
 status text not null default 'queued' check(status in('queued','sending','accepted','sent','delivered','failed','unknown','cancelled')),
 provider_sid text unique, error_code text, body text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index launch_messages_queue on spotted_private.launch_messages(created_at) where status='queued';
create table spotted_private.launch_audit (
 id bigint generated always as identity primary key, actor uuid references auth.users(id) on delete set null,
 action text not null, target uuid, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table spotted_private.launch_guests enable row level security;
alter table spotted_private.launch_messages enable row level security;
alter table spotted_private.launch_audit enable row level security;
revoke all on spotted_private.launch_guests,spotted_private.launch_messages,spotted_private.launch_audit from public,anon,authenticated;

create function spotted_private.require_launch_admin() returns void
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(select 1 from spotted_private.launch_operators where user_id=auth.uid() and wave_admin) then
 raise exception 'Admin access required' using errcode='42501'; end if;
end $$;

-- Only completed nominators enter the operational guest queue. A nominated
-- number never implies SMS consent. Global phone uniqueness deduplicates seeds.
create function spotted_private.sync_launch_guests() returns void
language sql security definer set search_path='' as $$
 insert into spotted_private.launch_guests(phone,source,nomination_id,nominated_by,wave_id,activated_at,claimed_by,claimed_at)
 select n.phone,'nomination',n.id,n.nominated_by,n.wave_id,w.activated_at,n.claimed_by,case when n.claimed_by is not null then now() end
 from spotted_private.launch_nominations n join spotted_private.launch_members m on m.user_id=n.nominated_by and m.completed_at is not null
 left join spotted_private.launch_waves w on w.id=n.wave_id
 on conflict(phone) do update set nomination_id=coalesce(launch_guests.nomination_id,excluded.nomination_id),nominated_by=coalesce(launch_guests.nominated_by,excluded.nominated_by)
$$;
select spotted_private.sync_launch_guests();

create or replace function spotted_private.launch_state() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); own_phone text; settings spotted_private.launch_settings; m spotted_private.launch_members; g spotted_private.launch_guests; admitted boolean:=false; needs_phone boolean;
begin
 if u is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into settings from spotted_private.launch_settings where singleton;
 select spotted_private.launch_phone(phone) into own_phone from auth.users where id=u and phone_confirmed_at is not null;
 select * into m from spotted_private.launch_members where user_id=u;
 needs_phone:=(settings.require_phone or settings.wave_gate) and m.completed_at is null;
 -- Previously completed accounts retain access. Incomplete accounts admitted
 -- while access was open do not bypass a subsequently enabled invitation gate.
 if m.completed_at is not null then admitted:=true;
 elsif not settings.wave_gate and (not needs_phone or own_phone is not null) then admitted:=true;
 elsif own_phone is not null then
   select x.* into g from spotted_private.launch_guests x join spotted_private.launch_waves w on w.id=x.wave_id
   where x.phone=own_phone and x.activated_at is not null and x.revoked_at is null
   and (x.claimed_by=u or (x.claimed_by is null and w.status='open')) for update of x;
   if g.id is not null then
     admitted:=true;
     update spotted_private.launch_guests set claimed_by=u,claimed_at=coalesce(claimed_at,now()) where id=g.id;
     update spotted_private.launch_nominations set claimed_by=u where id=g.nomination_id and claimed_by is null;
   end if;
 end if;
 if admitted then insert into spotted_private.launch_members(user_id) values(u) on conflict do nothing; end if;
 select * into m from spotted_private.launch_members where user_id=u;
 return jsonb_build_object('admitted',admitted,'profileSaved',m.profile_saved_at is not null,'complete',m.completed_at is not null,
 'hasPhone',own_phone is not null,'phoneRequired',needs_phone,
 'profile',(select jsonb_build_object('name',display_name,'username',username) from public.profiles where id=u),
 'cityTester',coalesce((select city_tester from spotted_private.launch_operators where user_id=u),false),
 'waveAdmin',coalesce((select wave_admin from spotted_private.launch_operators where user_id=u),false),
 'nominations',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'phone',phone,'activated',wave_id is not null) order by slot) from spotted_private.launch_nominations where nominated_by=u),'[]'::jsonb));
end $$;

-- Retain the well-tested nomination implementation and add the seed-list
-- collision check under a settings lock shared with imports.
alter function spotted_private.save_launch_nomination(integer,text) rename to save_launch_nomination_v1;
create function spotted_private.save_launch_nomination(p_slot integer,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare s jsonb; begin
 s:=spotted_private.launch_state();
 if not (s->>'admitted')::boolean then raise exception 'Your invitation is not active yet' using errcode='42501'; end if;
 perform 1 from spotted_private.launch_settings where singleton for update;
 if exists(select 1 from spotted_private.launch_guests where phone=spotted_private.launch_phone(p_phone)) then
 return jsonb_build_object('error','This number is already on Spotted or the invite list. Choose someone else.'); end if;
 return spotted_private.save_launch_nomination_v1(p_slot,p_phone);
end $$;
alter function spotted_private.complete_launch_onboarding() rename to complete_launch_onboarding_v1;
create function spotted_private.complete_launch_onboarding() returns jsonb
language plpgsql security definer set search_path='' as $$ declare s jsonb; begin
 s:=spotted_private.launch_state();
 if not (s->>'admitted')::boolean or ((s->>'phoneRequired')::boolean and not (s->>'hasPhone')::boolean) then
 raise exception 'Verify your invited phone number first' using errcode='42501'; end if;
 s:=spotted_private.complete_launch_onboarding_v1();
 if (s->>'complete')::boolean then perform spotted_private.sync_launch_guests(); end if;
 return s;
end $$;
-- Rebind SQL wrappers after renaming their implementations.
create or replace function public.save_launch_nomination(p_slot integer,p_phone text) returns jsonb language sql set search_path='' as $$ select spotted_private.save_launch_nomination(p_slot,p_phone) $$;
create or replace function public.complete_launch_onboarding() returns jsonb language sql set search_path='' as $$ select spotted_private.complete_launch_onboarding() $$;
-- Old clients must not activate an unreviewed batch alongside named waves.
create or replace function spotted_private.activate_launch_wave(p_request uuid,p_count integer) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform spotted_private.require_launch_admin();
 raise exception 'Use the Launch Center to review and open named waves' using errcode='22023';
end $$;

create function spotted_private.launch_admin(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare w spotted_private.launch_waves; g spotted_private.launch_guests; target uuid; item jsonb; normalized text;
 added integer:=0; duplicates integer:=0; invalid integer:=0; n integer; result jsonb; statuses text[]; link text; consent_time timestamptz;
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request'; end if;
 target:=nullif(p_data->>'id','')::uuid;
 if p_action='snapshot' then
   perform spotted_private.sync_launch_guests();
   return jsonb_build_object(
    'settings',(select jsonb_build_object('gated',wave_gate,'requirePhone',require_phone,'installUrl',install_url,'smsEnabled',sms_enabled) from spotted_private.launch_settings where singleton),
    'summary',(select jsonb_build_object('members',count(*),'legacy',count(*) filter(where grandfathered)) from spotted_private.launch_members where completed_at is not null),
    'waves',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select w.*,count(g.id) as selected,count(g.id) filter(where g.invited_at is not null) as invited,count(g.id) filter(where g.invited_at is not null and m.completed_at is null) as awaiting,count(g.id) filter(where g.claimed_at is not null) as started,count(g.id) filter(where m.completed_at is not null) as joined from spotted_private.launch_waves w left join spotted_private.launch_guests g on g.wave_id=w.id left join spotted_private.launch_members m on m.user_id=g.claimed_by group by w.id)t),'[]'::jsonb),
    'pending',(select count(*) from spotted_private.launch_guests where wave_id is null),
    'audit',coalesce((select jsonb_agg(t order by created_at desc) from(select a.action,a.target,a.details,a.created_at from spotted_private.launch_audit a order by id desc limit 30)t),'[]'::jsonb));
 elsif p_action='guests' then
   statuses:=array['queued','selected','ready','invited','started','joined','revoked'];
   with guests as (
    select g.*,p.display_name as nominator_name,m.completed_at as joined_at,msg.status as delivery,msg.error_code,
    case when m.completed_at is not null then 'joined' when g.claimed_at is not null then 'started' when g.revoked_at is not null then 'revoked' when g.invited_at is not null then 'invited' when g.activated_at is not null then 'ready' when g.wave_id is not null then 'selected' else 'queued' end as state
    from spotted_private.launch_guests g left join public.profiles p on p.id=g.nominated_by left join spotted_private.launch_members m on m.user_id=g.claimed_by left join spotted_private.launch_messages msg on msg.guest_id=g.id
   ), filtered as(select * from guests where
    (coalesce(p_data->>'wave','all')='all' or (p_data->>'wave'='queue' and wave_id is null) or wave_id::text=p_data->>'wave')
    and (coalesce(p_data->>'search','')='' or position(lower(left(p_data->>'search',80)) in lower(name||' '||phone||' '||coalesce(nominator_name,'')))>0)
    and (coalesce(p_data->>'status','all')='all' or state=p_data->>'status'))
   select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(t order by created_at,id),'[]'::jsonb)) into result
   from (select * from filtered order by created_at,id limit 100 offset greatest(0,least(100000,coalesce((p_data->>'offset')::int,0))))t;
   return result;
 end if;
 -- Serialise list mutations and capacities. No provider/network calls occur here.
 perform 1 from spotted_private.launch_settings where singleton for update;
 if p_action='create_wave' then
   if target is null or length(btrim(p_data->>'name')) not between 1 and 60 or coalesce((p_data->>'capacity')::integer,0) not between 1 and 500 then raise exception 'Choose a name and 1–500 places' using errcode='22023'; end if;
   insert into spotted_private.launch_waves(id,name,capacity,status,activated_at,activated_by,invitation_count) values(target,btrim(p_data->>'name'),(p_data->>'capacity')::int,'draft',null,auth.uid(),0) on conflict(id) do nothing;
 elsif p_action='import' then
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 500 then raise exception 'Import 1–500 rows' using errcode='22023'; end if;
   for item in select * from jsonb_array_elements(p_data->'rows') loop
     normalized:=spotted_private.launch_phone(item->>'phone');
     if normalized is null or length(coalesce(item->>'name',''))>80 then invalid:=invalid+1; continue; end if;
     if exists(select 1 from auth.users a join spotted_private.launch_members m on m.user_id=a.id and m.completed_at is not null where spotted_private.launch_phone(a.phone)=normalized)
     or exists(select 1 from spotted_private.launch_nominations where phone=normalized) then duplicates:=duplicates+1; continue; end if;
     insert into spotted_private.launch_guests(phone,name,source) values(normalized,coalesce(item->>'name',''),'seed') on conflict(phone) do nothing;
     if found then added:=added+1; else duplicates:=duplicates+1; end if;
   end loop;
   result:=jsonb_build_object('added',added,'duplicates',duplicates,'invalid',invalid);
 elsif p_action in('assign','remove') then
   if jsonb_typeof(p_data->'guests') is distinct from 'array' or jsonb_array_length(p_data->'guests') not between 1 and 500 then raise exception 'Select 1–500 guests'; end if;
   if p_action='assign' then
     select * into w from spotted_private.launch_waves where id=target for update;
     if w.id is null or w.status<>'draft' then raise exception 'Choose a draft wave'; end if;
     if exists(select 1 from spotted_private.launch_guests where id in(select value::uuid from jsonb_array_elements_text(p_data->'guests')) and (activated_at is not null or (wave_id is not null and wave_id<>target))) then raise exception 'A selected guest already belongs to another wave'; end if;
     select count(*) into n from spotted_private.launch_guests where wave_id=target or id in(select value::uuid from jsonb_array_elements_text(p_data->'guests'));
     if n>w.capacity then raise exception 'This selection exceeds the wave capacity'; end if;
     update spotted_private.launch_guests set wave_id=target where id in(select value::uuid from jsonb_array_elements_text(p_data->'guests')) and activated_at is null;
   else
     if exists(select 1 from spotted_private.launch_guests g join spotted_private.launch_waves w on w.id=g.wave_id where g.id in(select value::uuid from jsonb_array_elements_text(p_data->'guests')) and (w.status<>'draft' or g.activated_at is not null)) then raise exception 'Opened waves keep their membership history. Revoke unused invitations instead.'; end if;
     update spotted_private.launch_guests set wave_id=null where id in(select value::uuid from jsonb_array_elements_text(p_data->'guests')) and activated_at is null;
   end if;
 elsif p_action='open_wave' then
   select * into w from spotted_private.launch_waves where id=target for update;
   if w.id is null then raise exception 'Wave not found'; end if;
   if not (select wave_gate from spotted_private.launch_settings where singleton) then raise exception 'Enable invite-only admission before opening a wave'; end if;
   select install_url into link from spotted_private.launch_settings where singleton;
   if link is null then raise exception 'Set the public app installation link first'; end if;
   select count(*) into n from spotted_private.launch_guests where wave_id=target;
   if n=0 or n>w.capacity then raise exception 'Review the wave guest list and capacity'; end if;
   if exists(select 1 from spotted_private.launch_guests g join auth.users a on spotted_private.launch_phone(a.phone)=g.phone join spotted_private.launch_members m on m.user_id=a.id and m.completed_at is not null where g.wave_id=target and g.claimed_by is null) then raise exception 'Someone in this draft already joined. Remove them before opening.'; end if;
   update spotted_private.launch_waves set status='open',activated_at=coalesce(activated_at,now()),activated_by=auth.uid(),invitation_count=n where id=target;
   update spotted_private.launch_guests set activated_at=coalesce(activated_at,now()) where wave_id=target;
   update spotted_private.launch_nominations n set wave_id=target from spotted_private.launch_guests g where g.wave_id=target and g.nomination_id=n.id;
 elsif p_action='pause_wave' then
   update spotted_private.launch_waves set status='paused' where id=target and status='open';
 elsif p_action in('revoke','manual_sent','consent','queue_sms') then
   select * into g from spotted_private.launch_guests where id=target for update;
   if g.id is null then raise exception 'Guest not found'; end if;
   if p_action='revoke' then
     if g.claimed_by is not null then raise exception 'This person has started joining. Invitation revocation cannot remove their account.'; end if;
     update spotted_private.launch_guests set revoked_at=coalesce(revoked_at,now()) where id=target;
     update spotted_private.launch_messages set status='cancelled',updated_at=now() where guest_id=target and status='queued';
   elsif p_action='consent' then
     consent_time:=(p_data->>'at')::timestamptz;
     if consent_time is null or consent_time>now() or coalesce(length(btrim(p_data->>'note')),0) not between 10 and 500 or g.suppressed_at is not null then raise exception 'Record when and how this recipient requested Spotted invitation texts. A nomination is not consent.'; end if;
     update spotted_private.launch_guests set consent_at=consent_time,consent_note=btrim(p_data->>'note') where id=target;
   else
     if g.activated_at is null or g.revoked_at is not null or g.claimed_by is not null or g.suppressed_at is not null or not exists(select 1 from spotted_private.launch_waves where id=g.wave_id and status='open') then raise exception 'This invitation is not available to send'; end if;
     if p_action='manual_sent' then
       update spotted_private.launch_guests set invited_at=coalesce(invited_at,now()),invited_via=coalesce(invited_via,'manual') where id=target;
     else
       if g.consent_at is null or not(select sms_enabled from spotted_private.launch_settings where singleton) then raise exception 'SMS needs recipient consent and an enabled sender'; end if;
       select install_url into link from spotted_private.launch_settings where singleton;
       if link is null then raise exception 'Set the installation link first'; end if;
       insert into spotted_private.launch_messages(guest_id,body) values(target,'Spotted: your New York invitation is open. Join with the phone number receiving this text: '||link||' Reply STOP to opt out.') on conflict(guest_id) do nothing;
     end if;
   end if;
 elsif p_action='settings' then
   if p_data ? 'installUrl' then
     link:=nullif(btrim(p_data->>'installUrl'),'');
     if link is not null and link !~ '^https://(testflight\.apple\.com/j/[A-Za-z0-9]+|apps\.apple\.com/[A-Za-z0-9/?=&._%-]+)$' then raise exception 'Use an external TestFlight invitation link or App Store link'; end if;
     update spotted_private.launch_settings set install_url=link where singleton;
   end if;
   if p_data ? 'gated' then
     if (p_data->>'gated')::boolean and p_data->>'confirmation' is distinct from 'REQUIRE INVITATIONS' then raise exception 'Confirm invite-only admission'; end if;
     update spotted_private.launch_settings set wave_gate=(p_data->>'gated')::boolean,require_phone=(p_data->>'gated')::boolean where singleton;
   end if;
   -- Sender enablement is operator deployment configuration, never a client flag.
 else raise exception 'Unknown admin action' using errcode='22023'; end if;
 insert into spotted_private.launch_audit(actor,action,target,details) values(auth.uid(),p_action,target,
 case when p_action='import' then result when p_action in('assign','remove') then jsonb_build_object('count',jsonb_array_length(p_data->'guests')) else '{}'::jsonb end);
 return coalesce(result,jsonb_build_object('ok',true));
end $$;
create function public.launch_admin(p_action text,p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$ select spotted_private.launch_admin(p_action,p_data) $$;

-- The edge worker can claim exactly one queued text. A crash/timeout is never
-- automatically retried: ambiguous delivery stays visible for reconciliation.
create function spotted_private.launch_message_job(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare job spotted_private.launch_messages; g spotted_private.launch_guests; next_status text:=p_data->>'status';
begin
 if p_action='claim' then
   if not(select sms_enabled from spotted_private.launch_settings where singleton) then return null; end if;
   update spotted_private.launch_messages set status='unknown',updated_at=now() where status='sending' and updated_at<now()-interval '5 minutes';
   select m.* into job from spotted_private.launch_messages m join spotted_private.launch_guests g on g.id=m.guest_id join spotted_private.launch_waves w on w.id=g.wave_id
   where m.status='queued' and g.consent_at is not null and g.suppressed_at is null and g.revoked_at is null and g.claimed_by is null and w.status='open'
   order by m.created_at for update of m skip locked limit 1;
   if job.id is null then return null; end if;
   update spotted_private.launch_messages set status='sending',updated_at=now() where id=job.id;
   return jsonb_build_object('id',job.id,'to',(select phone from spotted_private.launch_guests where id=job.guest_id),'body',job.body);
 elsif p_action='status' then
   if next_status not in('accepted','sent','delivered','failed','unknown') then raise exception 'Invalid delivery state'; end if;
   select * into job from spotted_private.launch_messages where id=(p_data->>'id')::uuid for update;
   if job.id is null then return jsonb_build_object('ignored',true); end if;
   if job.provider_sid is not null and p_data->>'sid' is distinct from job.provider_sid then raise exception 'Message identity mismatch'; end if;
   if job.status in('delivered','cancelled') or (job.status='failed' and next_status<>'delivered') or (job.status='sent' and next_status in('accepted','unknown')) then return jsonb_build_object('ignored',true); end if;
   update spotted_private.launch_messages set status=next_status,provider_sid=coalesce(provider_sid,p_data->>'sid'),error_code=left(p_data->>'error',60),updated_at=now() where id=job.id;
   if next_status in('accepted','sent','delivered') then update spotted_private.launch_guests set invited_at=coalesce(invited_at,now()),invited_via=coalesce(invited_via,'sms') where id=job.guest_id; end if;
 elsif p_action='stop' then
   update spotted_private.launch_guests set suppressed_at=coalesce(suppressed_at,now()) where phone=spotted_private.launch_phone(p_data->>'phone') returning * into g;
   update spotted_private.launch_messages set status='cancelled',updated_at=now() where guest_id=g.id and status='queued';
 else raise exception 'Unknown delivery action'; end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.launch_message_job(p_action text,p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$ select spotted_private.launch_message_job(p_action,p_data) $$;

-- Public invokers and explicit private grants; no direct guest-list reads.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='spotted_private' and p.proname in('launch_message_job','require_launch_admin','sync_launch_guests','launch_admin','save_launch_nomination','save_launch_nomination_v1','complete_launch_onboarding','complete_launch_onboarding_v1'))
 or (n.nspname='public' and p.proname in('launch_admin','launch_message_job')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname in('launch_admin','save_launch_nomination','complete_launch_onboarding') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
grant usage on schema spotted_private to service_role;
grant execute on function public.launch_message_job(text,jsonb),spotted_private.launch_message_job(text,jsonb) to service_role;
notify pgrst,'reload schema';
