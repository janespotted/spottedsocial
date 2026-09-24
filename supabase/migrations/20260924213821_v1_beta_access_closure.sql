begin;

-- P0-09: no anonymous or arbitrary-viewer graph or phone oracle.
create or replace function public.is_mutual_friend(viewer_id uuid,target_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id
 and viewer_id<>target_user_id and not spotted_private.blocked(viewer_id,target_user_id)
 and exists(select 1 from public.profiles bridge where not coalesce(bridge.is_demo,false)
 and spotted_private.direct_friend(viewer_id,bridge.id)
 and spotted_private.direct_friend(target_user_id,bridge.id))
$$;
create or replace function public.get_mutual_friend_ids(p_user_id uuid)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p where auth.uid() is not null and auth.uid()=p_user_id
 and p.id<>p_user_id and not coalesce(p.is_demo,false)
 and not spotted_private.direct_friend(p_user_id,p.id)
 and public.is_mutual_friend(p_user_id,p.id)
$$;
create or replace function public.get_mutual_friends_with(p_other_id uuid)
returns table(user_id uuid,display_name text,username text,avatar_url text,is_demo boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.username,p.avatar_url,p.is_demo from public.profiles p
 where auth.uid() is not null and p_other_id<>auth.uid()
 and not spotted_private.blocked(auth.uid(),p_other_id)
 and p.id not in(auth.uid(),p_other_id) and not coalesce(p.is_demo,false)
 and spotted_private.direct_friend(auth.uid(),p.id)
 and spotted_private.direct_friend(p_other_id,p.id) order by p.display_name
$$;
-- Capture the formerly unversioned function as a restricted service adapter.
create or replace function public.match_phones(phone_list text[])
returns table(phone text,user_id uuid,display_name text,username text,avatar_url text)
language sql security definer set search_path='' as $$
 select u.phone::text,p.id,p.display_name,p.username,p.avatar_url
 from auth.users u join public.profiles p on p.id=u.id
 where u.phone=any(phone_list) and p.is_demo is false
$$;
revoke all on function public.match_phones(text[]) from public,anon,authenticated;
grant execute on function public.match_phones(text[]) to service_role;
revoke all on function public.is_direct_friend(uuid,uuid),public.is_close_friend(uuid,uuid),
 public.is_friend_or_mutual(uuid,uuid),public.is_mutual_friend(uuid,uuid),
 public.get_mutual_friend_ids(uuid),public.get_mutual_friends_with(uuid) from public,anon;
grant execute on function public.is_direct_friend(uuid,uuid),public.is_close_friend(uuid,uuid),
 public.is_friend_or_mutual(uuid,uuid),public.is_mutual_friend(uuid,uuid),
 public.get_mutual_friend_ids(uuid),public.get_mutual_friends_with(uuid) to authenticated;

-- Count requests/numbers, never retain submitted address books. One row/account;
-- locks make limits apply to parallel callers as well as the Edge Function.
create table spotted_private.contact_match_usage(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 hour_start timestamptz not null,day_start timestamptz not null,
 hour_requests integer not null default 0,hour_numbers integer not null default 0,
 day_requests integer not null default 0,day_numbers integer not null default 0
);
alter table spotted_private.contact_match_usage enable row level security;
revoke all on spotted_private.contact_match_usage from public,anon,authenticated;
create function public.match_contacts(p_phones text[])
returns table(phone text,user_id uuid,display_name text,username text,avatar_url text)
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); usage spotted_private.contact_match_usage;
 h timestamptz:=date_trunc('hour',now());d timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 phones text[]; amount integer;
begin
 if me is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' or not exists(select 1 from public.profiles where id=me and not coalesce(is_demo,false))
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_phones is null or cardinality(p_phones) not between 1 and 500
 or exists(select 1 from unnest(p_phones) p where p is null or p !~ '^\+?[1-9][0-9]{9,14}$')
 then raise exception 'Expected 1 to 500 valid phone numbers' using errcode='22023';end if;
 select array_agg(distinct ltrim(p,'+')) into phones from unnest(p_phones) p;
 amount:=cardinality(phones);
 insert into spotted_private.contact_match_usage(user_id,hour_start,day_start) values(me,h,d) on conflict do nothing;
 select * into usage from spotted_private.contact_match_usage where contact_match_usage.user_id=me for update;
 if usage.hour_start<>h then usage.hour_start:=h;usage.hour_requests:=0;usage.hour_numbers:=0;end if;
 if usage.day_start<>d then usage.day_start:=d;usage.day_requests:=0;usage.day_numbers:=0;end if;
 if usage.hour_requests>=20 or usage.day_requests>=40 or usage.hour_numbers+amount>1000 or usage.day_numbers+amount>2000
 then raise exception 'Contact matching limit reached; try later' using errcode='P0001';end if;
 update spotted_private.contact_match_usage set hour_start=h,day_start=d,
 hour_requests=usage.hour_requests+1,hour_numbers=usage.hour_numbers+amount,
 day_requests=usage.day_requests+1,day_numbers=usage.day_numbers+amount where contact_match_usage.user_id=me;
 return query select ltrim(u.phone,'+'),p.id,p.display_name,p.username,p.avatar_url
 from auth.users u join public.profiles p on p.id=u.id
 where ltrim(u.phone,'+')=any(phones) and p.id<>me and not coalesce(p.is_demo,false)
 and not spotted_private.blocked(me,p.id);
end $$;
revoke all on function public.match_contacts(text[]) from public,anon;
grant execute on function public.match_contacts(text[]) to authenticated;

-- P0-11: Yap is not a beta feature. Preserve service cleanup, not client UX.
revoke all on public.yap_messages,public.yap_comments,public.yap_votes,
 public.yap_comment_votes,public.venue_yap_messages from public,anon,authenticated;
grant all on public.yap_messages,public.yap_comments,public.yap_votes,
 public.yap_comment_votes,public.venue_yap_messages to service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like '%yap%'
 loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;

-- P0-14: operational logs are never a client API, including client inserts.
revoke all on public.push_logs from public,anon,authenticated;
grant all on public.push_logs to service_role;
-- Table revocation alone does not remove independently granted column access.
do $$ declare c record;begin
 for c in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name in ('yap_messages','yap_comments','yap_votes','yap_comment_votes','venue_yap_messages','push_logs')
 loop execute format('revoke all (%I) on public.%I from public,anon,authenticated',c.column_name,c.table_name);end loop;
end $$;
do $$ declare p record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='push_logs'
 loop execute format('drop policy %I on public.push_logs',p.policyname);end loop;
end $$;
revoke all on all functions in schema spotted_private from public,anon,authenticated;
-- Pure parser is used by authenticated media index maintenance (previous migration).
grant execute on function spotted_private.storage_key(text) to authenticated,service_role;
commit;
