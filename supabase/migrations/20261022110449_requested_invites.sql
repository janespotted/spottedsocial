-- Website requests are private intake, never app membership or permission to send an invitation.
create table spotted_private.invite_requests (
 id text primary key check (id ~ '^[a-f0-9]{24}$'),
 form_id text not null check (form_id = '6aa44b3bf24f7a00081682c2'),
 first_name text not null check (length(first_name) between 1 and 80),
 last_name text not null check (length(last_name) between 1 and 80),
 email text not null check (length(email) between 3 and 254),
 phone text not null default '' check (length(phone)<=32),
 neighborhood text not null default '' check(length(neighborhood)<=160),
 referred_by text not null default '' check(length(referred_by)<=120),
 submitted_at timestamptz not null,
 received_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null
);
alter table spotted_private.invite_requests enable row level security;
revoke all on spotted_private.invite_requests from public,anon,authenticated;
create index invite_requests_submitted_idx on spotted_private.invite_requests(submitted_at desc,id);
create table spotted_private.invite_request_connection (
 singleton boolean primary key default true check(singleton),
 enabled_at timestamptz,
 last_delivery_at timestamptz,
 last_backfill_at timestamptz
);
insert into spotted_private.invite_request_connection(singleton) values(true);
alter table spotted_private.invite_request_connection enable row level security;
revoke all on spotted_private.invite_request_connection from public,anon,authenticated;

-- Only the signature-verifying server can ingest. IDs make retries and historical imports idempotent.
create function public.ingest_invite_request(p_request jsonb,p_backfill boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
 if p_request->>'form_id' is distinct from '6aa44b3bf24f7a00081682c2' then raise exception 'Wrong form'; end if;
 if coalesce(p_request->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 if (p_request->>'submitted_at')::timestamptz > now()+interval '1 day' then raise exception 'Invalid submission date'; end if;
 insert into spotted_private.invite_requests(id,form_id,first_name,last_name,email,phone,neighborhood,referred_by,submitted_at)
 values(p_request->>'id',p_request->>'form_id',btrim(p_request->>'first_name'),btrim(p_request->>'last_name'),lower(btrim(p_request->>'email')),
 coalesce(p_request->>'phone',''),coalesce(p_request->>'neighborhood',''),coalesce(p_request->>'referred_by',''),(p_request->>'submitted_at')::timestamptz)
 on conflict(id) do nothing;
 inserted:=found;
 update spotted_private.invite_request_connection set
 last_delivery_at=case when not p_backfill then now() else last_delivery_at end,
 last_backfill_at=case when p_backfill then now() else last_backfill_at end where singleton;
 return jsonb_build_object('accepted',true,'inserted',inserted);
end $$;
revoke all on function public.ingest_invite_request(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ingest_invite_request(jsonb,boolean) to service_role;

create function public.requested_invites(p_action text default 'list',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; reviewed boolean;
begin
 perform spotted_private.require_launch_admin();
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request';end if;
 if p_action='list' then
  with filtered as (
   select r.* from spotted_private.invite_requests r
   where (coalesce(p_data->>'status','all')='all' or p_data->>'status'='new' and reviewed_at is null or p_data->>'status'='reviewed' and reviewed_at is not null)
   and (coalesce(p_data->>'search','')='' or position(lower(left(p_data->>'search',160)) in lower(concat_ws(' ',first_name,last_name,email,phone,neighborhood,referred_by)))>0)
  ) select jsonb_build_object(
   'total',(select count(*) from filtered),
   'summary',(select jsonb_build_object('total',count(*),'new',count(*) filter(where reviewed_at is null),'withPhone',count(*) filter(where phone<>'')) from spotted_private.invite_requests),
   'connection',(select jsonb_build_object('enabledAt',enabled_at,'lastDeliveryAt',last_delivery_at,'backfilledAt',last_backfill_at) from spotted_private.invite_request_connection where singleton),
   'rows',coalesce(jsonb_agg(t order by submitted_at desc,id),'[]'::jsonb)) into result from
   (select id,first_name,last_name,email,phone,neighborhood,referred_by,submitted_at,reviewed_at from filtered order by submitted_at desc,id limit 50 offset greatest(0,least(100000,coalesce((p_data->>'offset')::int,0))))t;
  return result;
 elsif p_action='review' then
  if jsonb_typeof(p_data->'reviewed') is distinct from 'boolean' then raise exception 'Choose a review status';end if;
  reviewed:=(p_data->>'reviewed')::boolean;
  update spotted_private.invite_requests set reviewed_at=case when reviewed then now() end,reviewed_by=case when reviewed then auth.uid() end where id=p_data->>'id';
  if not found then raise exception 'Request not found';end if;
  insert into spotted_private.launch_audit(actor,action,details) values(auth.uid(),'invite_request_review',jsonb_build_object('submission',p_data->>'id','reviewed',reviewed));
  return jsonb_build_object('ok',true);
 else raise exception 'Unknown request action';end if;
end $$;
revoke all on function public.requested_invites(text,jsonb) from public,anon;
grant execute on function public.requested_invites(text,jsonb) to authenticated;
