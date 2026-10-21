-- Recheck account exclusions on delivery and in historical aggregate reports.
begin;
create or replace function spotted_private.notification_allowed(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare pref public.notification_preferences;
begin
 if coalesce(n.is_demo,false) or spotted_private.blocked(n.sender_id,n.receiver_id)
 or exists(select 1 from public.profiles where id in(n.sender_id,n.receiver_id) and coalesce(is_demo,false)) then return false;end if;
 select * into pref from public.notification_preferences where user_id=n.receiver_id;
 if n.type in ('friend_out','friend_planning','friend_arrived_venue','friend_arrived','friend_checkin','friends_at_venue') then
  if not spotted_private.night_mode_open_for(n.sender_id) or not spotted_private.night_mode_open_for(n.receiver_id)
    or not spotted_private.wants_activity(n.receiver_id,n.sender_id,n.type not in ('friend_out','friend_planning')) then return false;end if;
 end if;
 if n.type in ('dm','plan_invite','plan_down','plan_comment','venue_invite','venue_invite_accepted','venue_invite_declined','meetup_request','meetup_accepted','meetup_declined','private_party_invite','address_request','party_invite_accepted','party_address_approved','friend_request','friend_accepted','invite_accepted')
 and not coalesce(pref.messages_enabled,true) then return false;end if;
 if n.type in ('daily_nudge_first','daily_nudge_second','weekend_rally') then
  return n.type='weekend_rally' and coalesce(pref.planning_enabled,false)
   and n.sender_id=n.receiver_id and not coalesce(n.is_demo,false)
   and exists(select 1 from public.profiles p where p.id=n.receiver_id and not coalesce(p.is_demo,false) and not public.is_night_mode(p.city))
   and exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled);
 end if;
 if n.type='morning_after' then
  return coalesce(pref.recap_enabled,false) and n.sender_id=n.receiver_id and not coalesce(n.is_demo,false)
   and exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled)
   and exists(select 1 from public.night_recaps r where r.user_id=n.receiver_id and r.expires_at>now() and not r.is_preview
    and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id)));
 end if;
 if n.type='plan_comment' then return spotted_private.notification_source_visible(n);end if;
 return spotted_private.notification_before_ux(n);
end $$;
create view spotted_private.measured_usage with (security_invoker=true) as
 select e.* from spotted_private.usage_events e join public.profiles p on p.id=e.user_id
 where not coalesce(p.is_demo,false)
 and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=e.user_id)
 and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=e.user_id);
revoke all on spotted_private.measured_usage from public,anon,authenticated;
create or replace function public.usage_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),90)));
begin
 return jsonb_build_object(
 'since',since,
 'actions',coalesce((select jsonb_agg(to_jsonb(x)) from (select event,mode,count(*) events,count(distinct user_id) people from spotted_private.measured_usage where created_at>=since group by event,mode order by event,mode) x),'[]'::jsonb),
 'plans_with_friend_reply',(select count(distinct p.entity_id) from spotted_private.measured_usage p join spotted_private.measured_usage r on r.entity_id=p.entity_id and r.user_id<>p.user_id and r.event in ('plan_response','plan_message') where p.event='plan_created' and p.created_at>=since),
 'people_returning_on_a_later_night',(select count(*) from (select user_id from spotted_private.measured_usage where created_at>=since and event='session_open' group by user_id having count(distinct night_date)>1) x),
 'people_active_on_multiple_nights',(select count(*) from (select user_id from spotted_private.measured_usage where created_at>=since and event='status_shared' group by user_id having count(distinct night_date)>1) x),
 'failures_by_feature',coalesce((select jsonb_agg(to_jsonb(x)) from (select feature,count(*) failures from spotted_private.measured_usage where event='action_failed' and created_at>=since group by feature) x),'[]'::jsonb)
 );
end $$;
commit;
