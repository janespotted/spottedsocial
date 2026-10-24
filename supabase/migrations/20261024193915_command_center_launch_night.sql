begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

-- Read-only founder operations. No new audience grants, attendance history, or GPS copies.
create function spotted_private.command_launch_night(p_city text default 'nyc') returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare result jsonb; boundary timestamptz;
begin
 if not spotted_private.is_launch_monitor() then raise exception 'Founder monitoring access required' using errcode='42501'; end if;
 if p_city is null or p_city not in ('nyc','la') then raise exception 'Invalid city' using errcode='22023'; end if;
 boundary:=public.night_start_at(p_city,now());
 with people as materialized (
  select p.id,p.display_name,p.username from public.profiles p
  join spotted_private.launch_members m on m.user_id=p.id and m.completed_at is not null
  where p.city=p_city and spotted_private.measurement_eligible(p.id)
 ), statuses as materialized (
  select p.*,s.venue_id,coalesce(s.is_private_party,false) private_party,
   case when s.expires_at>now() and s.updated_at>=boundary and not coalesce(s.is_demo,false)
    then case s.status::text when 'out' then 'out' when 'planning' then 'tbd' when 'home' then 'in' when 'off' then 'paused' else 'unknown' end
    else 'unknown' end state
  from people p left join public.night_statuses s on s.user_id=p.id
 ), visible as materialized (
  select s.id,s.display_name,s.username,v.id venue_id,v.name,v.neighborhood,v.lat,v.lng
  from statuses s join public.venues v on v.id=s.venue_id
  where s.state='out' and not s.private_party and public.can_see_location(auth.uid(),s.id)
   and v.city=p_city and not coalesce(v.is_demo,false) and not coalesce(v.is_user_submitted,false)
   and v.type in ('bar','club','nightclub','cocktail_bar','lounge','restaurant','rooftop','members_club')
   and v.lat between -85 and 85 and v.lng between -180 and 180
 ), venues as (
  select venue_id,name,neighborhood,lat,lng,count(*) people,
   jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(display_name,''),nullif(username,''),'Spotted member')) order by coalesce(display_name,username,''),id) members
  from visible group by venue_id,name,neighborhood,lat,lng
 ) select jsonb_build_object('generated_at',now(),'city',p_city,'night_started_at',boundary,
  'counts',jsonb_build_object('eligible',(select count(*) from people),
   'out',(select count(*) from statuses where state='out'),'tbd',(select count(*) from statuses where state='tbd'),
   'in',(select count(*) from statuses where state='in'),'paused',(select count(*) from statuses where state='paused'),
   'unknown',(select count(*) from statuses where state='unknown'),'mapped',(select count(*) from visible)),
  'viewer_participates',spotted_private.viewer_participates(auth.uid()),
  'venues',coalesce((select jsonb_agg(to_jsonb(v) order by people desc,name,venue_id) from venues v),'[]'),
  'presence',jsonb_build_object('online',(select count(distinct s.user_id) from spotted_private.app_sessions s join people p on p.id=s.user_id where s.ended_at is null and s.last_seen_at>now()-interval '90 seconds'),
   'last_heartbeat',(select max(s.last_seen_at) from spotted_private.app_sessions s join people p on p.id=s.user_id),
   'reporting_24h',(select count(distinct s.user_id) from spotted_private.app_sessions s join people p on p.id=s.user_id where s.last_seen_at>now()-interval '24 hours')),
  'readiness',jsonb_build_object(
   'install_link_saved',coalesce((select install_url is not null from spotted_private.launch_settings where singleton),false),
   'phone_gate_enabled',coalesce((select wave_gate and require_phone from spotted_private.launch_settings where singleton),false),
   'sms_enabled',coalesce((select sms_enabled from spotted_private.launch_settings where singleton),false),
   'push_enabled',coalesce((select delivery_enabled from spotted_private.push_settings where singleton),false),
   'push_accepted_24h',(select count(*) from public.push_logs where success is true and created_at>now()-interval '24 hours'),
   'last_screen_event',(select max(created_at) from spotted_private.usage_events where event='screen_view' and spotted_private.measurement_eligible(user_id)),
   'last_api_event',(select max(created_at) from spotted_private.usage_events where event='api_request' and spotted_private.measurement_eligible(user_id)),
   'email_enabled',coalesce((select enabled from spotted_private.launch_email_settings where id),false),
   'email_last_worker',(select last_worker_at from spotted_private.launch_email_settings where id),
   'email_last_accepted',(select last_accepted_at from spotted_private.launch_email_settings where id),
   'expired_statuses',(select count(*) from public.night_statuses s join public.profiles p on p.id=s.user_id where p.city=p_city and spotted_private.measurement_eligible(s.user_id) and not coalesce(s.is_demo,false) and s.status::text in ('out','planning') and s.expires_at<now()-interval '2 minutes'),
   'reset_jobs',coalesce((select jsonb_agg(jsonb_build_object('name',j.jobname,'enabled',j.active,'last_run',r.start_time,'status',r.status) order by j.jobname)
    from cron.job j left join lateral (select status,start_time from cron.job_run_details where jobid=j.jobid order by start_time desc limit 1) r on true
    where j.jobname in ('nightly-reset-et-dst','nightly-reset-et','nightly-reset-pt-dst','nightly-reset-pt')),'[]')
  )) into result;
 return result;
end $$;
revoke all on function spotted_private.command_launch_night(text) from public,anon;
grant execute on function spotted_private.command_launch_night(text) to authenticated;
create function public.command_launch_night(p_city text default 'nyc') returns jsonb language sql stable security invoker set search_path='' as $$ select spotted_private.command_launch_night(p_city); $$;
revoke all on function public.command_launch_night(text) from public,anon;
grant execute on function public.command_launch_night(text) to authenticated;

-- The launch roster includes selected people before signup, without phone/email or location.
create function spotted_private.command_launch_roster() returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare result jsonb;
begin
 if not spotted_private.is_launch_monitor() then raise exception 'Founder monitoring access required' using errcode='42501';end if;
 with guests as materialized (
  select g.id,g.name,w.name wave,g.invited_at,g.claimed_at,m.completed_at,
   case when g.claimed_by is not null then not spotted_private.measurement_eligible(g.claimed_by) else false end excluded,
   (select min(e.created_at) from spotted_private.usage_events e where e.user_id=g.claimed_by and e.event='checkin_created') first_checkin,
   (select count(*) from spotted_private.usage_events e where e.user_id=g.claimed_by and e.created_at>now()-interval '24 hours' and (e.event='action_failed' or (e.event='api_request' and e.outcome<>'ok'))) errors_24h,
   (select max(e.created_at) from spotted_private.usage_events e where e.user_id=g.claimed_by and e.event not in ('action_failed','api_request')) last_activity,
   (select count(distinct case when f.user_id=g.claimed_by then f.friend_id else f.user_id end)
     from public.friendships f where f.status='accepted' and (f.user_id=g.claimed_by or f.friend_id=g.claimed_by)
      and spotted_private.measurement_eligible(case when f.user_id=g.claimed_by then f.friend_id else f.user_id end)
      and not exists(select 1 from public.blocked_users b where (b.blocker_id=f.user_id and b.blocked_id=f.friend_id) or (b.blocker_id=f.friend_id and b.blocked_id=f.user_id))) friends
  from spotted_private.launch_guests g join spotted_private.launch_waves w on w.id=g.wave_id
  left join spotted_private.launch_members m on m.user_id=g.claimed_by
  where g.revoked_at is null
 ), rows as (
  select *,case when excluded then 'excluded' when errors_24h>=3 then 'repeated_errors'
   when invited_at is null then 'not_invited' when claimed_at is null then 'not_joined'
   when completed_at is null then 'setup_incomplete' when friends=0 then 'no_friends'
   when first_checkin is null then 'no_checkin_recorded' else 'activated' end attention from guests
 ) select jsonb_build_object('generated_at',now(),'total',(select count(*) from rows),
  'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from rows order by errors_24h desc,name,id limit 500) r),'[]')) into result;
 return result;
end $$;
revoke all on function spotted_private.command_launch_roster() from public,anon;
grant execute on function spotted_private.command_launch_roster() to authenticated;
create function public.command_launch_roster() returns jsonb language sql stable security invoker set search_path='' as $$ select spotted_private.command_launch_roster(); $$;
revoke all on function public.command_launch_roster() from public,anon;
grant execute on function public.command_launch_roster() to authenticated;
commit;
