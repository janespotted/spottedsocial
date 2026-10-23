begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Founder-only account diagnostics: no phone numbers, messages or locations.
create function spotted_private.command_people(p_filter text default 'attention',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare result jsonb;
begin
 if not spotted_private.is_launch_monitor() then raise exception 'Founder monitoring access required' using errcode='42501';end if;
 if p_filter is null or p_filter not in ('attention','all','excluded') then raise exception 'Invalid filter' using errcode='22023';end if;
 with people as materialized (
  select p.id,p.display_name,p.username,p.created_at,m.completed_at,
   case when coalesce(p.is_demo,false) then 'demo' when exists(select 1 from spotted_private.night_mode_testers t where t.user_id=p.id) then 'tester'
    when exists(select 1 from spotted_private.usage_exclusions x where x.user_id=p.id) then 'manual' when p.city is null or p.city not in ('nyc','la') then 'other_city' else null end excluded,
   case when m.completed_at is not null then 'complete' when m.admitted_at is null then 'waiting_for_access' when m.profile_saved_at is null then 'profile' else 'nominations_or_completion' end stage,
   (select count(*) from spotted_private.usage_events e where e.user_id=p.id and e.created_at>now()-interval '24 hours' and (e.event='action_failed' or(e.event='api_request' and e.outcome<>'ok'))) errors_24h,
   (select max(created_at) from spotted_private.usage_events e where e.user_id=p.id and e.event not in ('api_request','action_failed')) last_activity,
   exists(select 1 from public.friendships f where f.status='accepted' and ((f.user_id=p.id and spotted_private.measurement_eligible(f.friend_id)) or (f.friend_id=p.id and spotted_private.measurement_eligible(f.user_id)))
    and not exists(select 1 from public.blocked_users b where (b.blocker_id=f.user_id and b.blocked_id=f.friend_id) or(b.blocker_id=f.friend_id and b.blocked_id=f.user_id))) has_friends
  from public.profiles p left join spotted_private.launch_members m on m.user_id=p.id
 ), filtered as (
  select * from people where p_filter='all' or(p_filter='excluded' and excluded is not null)
   or(p_filter='attention' and excluded is null and (errors_24h>=3 or(completed_at is null and created_at<now()-interval '24 hours') or(completed_at is not null and not has_friends)))
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(
  select id,display_name,username,excluded,stage,errors_24h,last_activity,has_friends from filtered order by errors_24h desc,created_at desc,id limit 25 offset greatest(0,least(coalesce(p_offset,0),10000))
 )p),'generated_at',now()) into result;
 return result;
end $$;
revoke all on function spotted_private.command_people(text,integer) from public,anon;
grant execute on function spotted_private.command_people(text,integer) to authenticated;
create function public.command_people(p_filter text default 'attention',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select spotted_private.command_people(p_filter,p_offset);$$;
revoke all on function public.command_people(text,integer) from public,anon;
grant execute on function public.command_people(text,integer) to authenticated;
create function spotted_private.set_measurement_exclusion(p_user uuid,p_exclude boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not spotted_private.is_launch_monitor() then raise exception 'Founder monitoring access required' using errcode='42501';end if;
 if p_user is null or p_exclude is null or not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown account' using errcode='22023';end if;
 if p_exclude then insert into spotted_private.usage_exclusions(user_id) values(p_user) on conflict do nothing;
 else delete from spotted_private.usage_exclusions where user_id=p_user;end if;
 insert into spotted_private.launch_audit(actor,action,target,details) values(auth.uid(),'analytics_exclusion',p_user,jsonb_build_object('excluded',p_exclude));
end $$;
revoke all on function spotted_private.set_measurement_exclusion(uuid,boolean) from public,anon;
grant execute on function spotted_private.set_measurement_exclusion(uuid,boolean) to authenticated;
create function public.set_measurement_exclusion(p_user uuid,p_exclude boolean) returns void language sql security invoker set search_path='' as $$select spotted_private.set_measurement_exclusion(p_user,p_exclude);$$;
revoke all on function public.set_measurement_exclusion(uuid,boolean) from public,anon;
grant execute on function public.set_measurement_exclusion(uuid,boolean) to authenticated;
commit;
