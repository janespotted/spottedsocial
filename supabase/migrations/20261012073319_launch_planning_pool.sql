-- Private, phoneless planning contacts. An event RSVP is never a Spotted invite.
create table spotted_private.launch_prospects (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 source text not null check(length(source) between 1 and 200),
 name text not null check(length(name) between 1 and 160),
 event_status text not null default '' check(length(event_status)<=80),
 rsvp_date text not null default '' check(length(rsvp_date)<=100),
 invited_by text not null default '' check(length(invited_by)<=160),
 plus_one_of text not null default '' check(length(plus_one_of)<=160),
 phone text check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 shortlisted boolean not null default false,
 guest_id uuid unique references spotted_private.launch_guests(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table spotted_private.launch_prospects enable row level security;
revoke all on spotted_private.launch_prospects from public,anon,authenticated;
create index launch_prospects_name on spotted_private.launch_prospects(name,id);
create function spotted_private.launch_pool(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; v spotted_private.launch_prospects; ph text; gid uuid; added int:=0; duplicate int:=0; k text; result jsonb;
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request'; end if;
 if p_action='list' then
  with filtered as (
   select p.*,w.name wave_name from spotted_private.launch_prospects p
   left join spotted_private.launch_guests g on g.id=p.guest_id left join spotted_private.launch_waves w on w.id=g.wave_id
   where (coalesce(p_data->>'search','')='' or position(lower(left(p_data->>'search',160)) in lower(p.name))>0)
   and (coalesce(p_data->>'status','all')='all' or p_data->>'status'='missing_phone' and p.phone is null or p_data->>'status'='shortlisted' and p.shortlisted or p_data->>'status'='ready' and p.phone is not null)
  ) select jsonb_build_object('total',(select count(*) from filtered),
    'summary',(select jsonb_build_object('total',count(*),'missingPhone',count(*) filter(where phone is null),'shortlisted',count(*) filter(where shortlisted),'ready',count(*) filter(where phone is not null)) from spotted_private.launch_prospects),
    'rows',coalesce(jsonb_agg(t order by name,id),'[]'::jsonb)) into result from
    (select * from filtered order by name,id limit 100 offset greatest(0,least(100000,coalesce((p_data->>'offset')::int,0))))t;
  return result;
 end if;
 perform 1 from spotted_private.launch_settings where singleton for update;
 if p_action='import' then
  if length(coalesce(btrim(p_data->>'source'),'')) not between 1 and 200 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 500 then raise exception 'Choose a source and 1–500 people'; end if;
  for item in select * from jsonb_array_elements(p_data->'rows') loop
   if length(coalesce(btrim(item->>'name'),'')) not between 1 and 160 then raise exception 'Every person needs a name (up to 160 characters)'; end if;
   k:=md5(jsonb_build_array(btrim(p_data->>'source'),btrim(item->>'name'),coalesce(item->>'event_status',''),coalesce(item->>'rsvp_date',''),coalesce(item->>'invited_by',''),coalesce(item->>'plus_one_of',''))::text);
   insert into spotted_private.launch_prospects(source_key,source,name,event_status,rsvp_date,invited_by,plus_one_of)
   values(k,btrim(p_data->>'source'),btrim(item->>'name'),coalesce(item->>'event_status',''),coalesce(item->>'rsvp_date',''),coalesce(item->>'invited_by',''),coalesce(item->>'plus_one_of','')) on conflict(source_key) do nothing;
   if found then added:=added+1; else duplicate:=duplicate+1; end if;
  end loop;
  result:=jsonb_build_object('added',added,'duplicates',duplicate);
 elsif p_action='update' then
  select * into v from spotted_private.launch_prospects where id=(p_data->>'id')::uuid for update;
  if v.id is null then raise exception 'Person not found'; end if;
  if p_data ? 'shortlisted' then update spotted_private.launch_prospects set shortlisted=(p_data->>'shortlisted')::boolean where id=v.id; end if;
  if p_data ? 'phone' then
   ph:=spotted_private.launch_phone(p_data->>'phone');
   if ph is null then raise exception 'Enter a valid phone number with country code'; end if;
   if v.guest_id is not null and v.phone is distinct from ph then raise exception 'This person is already linked to the invitation queue. Review that guest before changing identity.'; end if;
   if exists(select 1 from spotted_private.launch_prospects where phone=ph and id<>v.id) then raise exception 'That phone is already attached to another planning contact'; end if;
   update spotted_private.launch_prospects set phone=ph where id=v.id;
  end if;
  result:=jsonb_build_object('ok',true);
 elsif p_action='queue' then
  select * into v from spotted_private.launch_prospects where id=(p_data->>'id')::uuid for update;
  if v.id is null or v.phone is null then raise exception 'Save their phone number first'; end if;
  if exists(select 1 from auth.users a join spotted_private.launch_members m on m.user_id=a.id where m.completed_at is not null and spotted_private.launch_phone(a.phone)=v.phone) then raise exception 'This number already belongs to a Spotted member'; end if;
  perform spotted_private.sync_launch_guests();
  if exists(select 1 from spotted_private.launch_nominations n where n.phone=v.phone) and not exists(select 1 from spotted_private.launch_guests g where g.phone=v.phone) then raise exception 'This number is reserved by an unfinished nomination'; end if;
  insert into spotted_private.launch_guests(phone,name,source) values(v.phone,left(v.name,80),'seed') on conflict(phone) do nothing;
  select id into gid from spotted_private.launch_guests where phone=v.phone;
  update spotted_private.launch_prospects set guest_id=gid where id=v.id;
  result:=jsonb_build_object('ok',true,'guestId',gid);
 else raise exception 'Unknown planning action'; end if;
 insert into spotted_private.launch_audit(actor,action,target,details) values(auth.uid(),'pool_'||p_action,nullif(p_data->>'id','')::uuid,case when p_action='import' then result else '{}'::jsonb end);
 return result;
end $$;
create function public.launch_pool(p_action text,p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$ select spotted_private.launch_pool(p_action,p_data) $$;
revoke all on function spotted_private.launch_pool(text,jsonb),public.launch_pool(text,jsonb) from public,anon,authenticated;
grant execute on function spotted_private.launch_pool(text,jsonb),public.launch_pool(text,jsonb) to authenticated;
