-- Count-only live access until the viewer participates in tonight. Historical
-- venue audiences remain unchanged; this gate applies only to current activity.
begin;
create or replace function spotted_private.viewer_participates(p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.night_statuses s where s.user_id=p_viewer
   and s.status in ('out','planning') and s.expires_at>now())
$$;
revoke all on function spotted_private.viewer_participates(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (viewer_id=target_user_id or spotted_private.viewer_participates(viewer_id)) and exists(select 1 from public.night_statuses s join public.profiles p on p.id=s.user_id
 where s.user_id=target_user_id and s.status='out' and s.expires_at>now()
 and spotted_private.location_audience(viewer_id,target_user_id,p.location_sharing_level))
$function$
;
create or replace function public.can_see_planning(viewer_id uuid,target_user_id uuid,visibility text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id
 and (viewer_id=target_user_id or spotted_private.viewer_participates(viewer_id))
 and exists(select 1 from public.night_statuses s where s.user_id=target_user_id
 and s.status='planning' and s.expires_at>now()
 and spotted_private.location_audience(viewer_id,target_user_id,coalesce(s.planning_visibility,
 (select location_sharing_level from public.profiles where id=s.user_id),'all_friends')))
$$;
create or replace function spotted_private.social_visible(viewer uuid,owner_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (viewer=owner_id or spotted_private.viewer_participates(viewer)) and exists(
 select 1 from public.profiles v,public.profiles p join public.night_statuses s on s.user_id=p.id
 where v.id=viewer and p.id=owner_id and not coalesce(v.is_demo,false) and not coalesce(p.is_demo,false)
 and s.status in ('out','planning') and s.expires_at>now()
 and spotted_private.location_audience(viewer,owner_id,case when s.status='planning'
 then coalesce(s.planning_visibility,p.location_sharing_level) else p.location_sharing_level end))
$$;

-- No IDs, names, photos, venues, filters or arbitrary viewer arguments.
create or replace function public.get_friends_night_counts()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('out',count(*) filter(where s.status='out'),
   'planning',count(*) filter(where s.status='planning'))
 from public.night_statuses s join public.profiles p on p.id=s.user_id
 where auth.uid() is not null and s.user_id<>auth.uid() and s.expires_at>now()
 and s.status in ('out','planning') and not coalesce(p.is_demo,false)
 and spotted_private.direct_friend(auth.uid(),s.user_id)
 and spotted_private.location_audience(auth.uid(),s.user_id,case when s.status='planning'
 then coalesce(s.planning_visibility,p.location_sharing_level) else p.location_sharing_level end)
$$;
revoke all on function public.get_friends_night_counts() from public,anon;
grant execute on function public.get_friends_night_counts() to authenticated;

CREATE OR REPLACE FUNCTION spotted_private.notification_source_visible(n notifications)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.plans;s public.night_statuses;
begin
 if n.is_demo is true or spotted_private.blocked(n.sender_id,n.receiver_id) then return false;end if;
 if not exists(select 1 from public.profiles where id=n.receiver_id) or not exists(select 1 from public.profiles where id=n.sender_id) then return false;end if;
 if n.type in ('plan_invite','plan_down') then
 select * into p from public.plans where id=(n.data->>'plan_id')::uuid;
 return p.id is not null and p.expires_at>now() and p.privacy_revision=(n.data->>'plan_revision')::timestamptz
 and spotted_private.plan_visible(n.receiver_id,p.id) and spotted_private.plan_visible(n.sender_id,p.id)
 and ((n.type='plan_invite' and n.sender_id=p.user_id and exists(select 1 from public.plan_participants where plan_id=p.id and user_id=n.receiver_id))
 or (n.type='plan_down' and n.receiver_id=p.user_id and exists(select 1 from public.plan_downs where plan_id=p.id and user_id=n.sender_id)));
 end if;
 if n.type in ('friend_out','friend_planning','friend_arrived_venue','friend_arrived','friend_checkin','friends_at_venue') then
 if not spotted_private.viewer_participates(n.receiver_id) then return false;end if;
 select * into s from public.night_statuses where user_id=n.sender_id;
 return s.id is not null and s.expires_at>now() and s.expires_at=(n.data->>'night_expiry')::timestamptz
 and spotted_private.location_audience(n.receiver_id,n.sender_id,case when n.type='friend_planning'
 then coalesce(s.planning_visibility,(select location_sharing_level from public.profiles where id=s.user_id),'all_friends')
 else (select location_sharing_level from public.profiles where id=s.user_id) end)
 and (not (n.data ? 'status_venue_id') or n.data->>'status_venue_id'=s.venue_id::text)
 and ((n.type='friend_planning' and s.status='planning') or (n.type='friend_out' and s.status='out')
 or(n.type not in('friend_planning','friend_out') and s.status='out' and not coalesce(s.is_private_party,false) and n.data->>'venue_id'=s.venue_id::text));
 end if;
 if n.type in ('post_tag','post_like','post_comment') then return spotted_private.post_visible(n.receiver_id,(n.data->>'post_id')::uuid);end if;
 if n.type='dm' then
 return exists(select 1 from public.dm_messages m join public.profiles recipient on recipient.id=n.receiver_id
 where m.id=coalesce(n.data->>'message_id',split_part(n.event_key,':',2))::uuid
 and m.thread_id=(n.data->>'thread_id')::uuid and m.sender_id=n.sender_id
 and m.created_at>=public.night_start_at(recipient.city,now())
 and exists(select 1 from public.dm_thread_members where thread_id=m.thread_id and user_id=n.receiver_id)
 and exists(select 1 from public.dm_thread_members where thread_id=m.thread_id and user_id=n.sender_id));
 end if;
 if n.type in ('private_party_invite','address_request','party_invite_accepted','party_address_approved') then
 return exists(select 1 from public.party_requests pr join public.night_statuses ns on ns.id=pr.status_id and ns.user_id=pr.host_id
 where pr.id::text=n.data->>'request_id' and pr.expires_at>now() and ns.expires_at=pr.expires_at
 and ns.status='out' and ns.is_private_party is true
 and ((n.sender_id=pr.host_id and n.receiver_id=pr.guest_id) or(n.receiver_id=pr.host_id and n.sender_id=pr.guest_id))
 and pr.state<>'declined' and spotted_private.social_visible(pr.guest_id,pr.host_id)
 and spotted_private.direct_friend(pr.host_id,pr.guest_id));
 end if;
 if n.type='friend_request' then return exists(select 1 from public.friendships f where f.user_id=n.sender_id and f.friend_id=n.receiver_id and f.status='pending');end if;
 if n.type in ('venue_invite','venue_invite_accepted','venue_invite_declined','meetup_request','meetup_accepted','meetup_declined')
 and n.data ? 'invite_id' then
 return exists(select 1 from public.invites i where i.id=(n.data->>'invite_id')::uuid and i.expires_at>now()
 and i.kind=case when n.type like 'venue%' then 'venue' else 'meetup' end
 and spotted_private.invite_allowed(i.kind,i.sender_id,i.receiver_id)
 and ((n.type in ('venue_invite','meetup_request') and n.sender_id=i.sender_id and n.receiver_id=i.receiver_id)
 or (n.type in ('venue_invite_accepted','meetup_accepted') and i.status='accepted' and n.sender_id=i.receiver_id and n.receiver_id=i.sender_id)
 or (n.type in ('venue_invite_declined','meetup_declined') and i.status='declined' and n.sender_id=i.receiver_id and n.receiver_id=i.sender_id)));
 end if;
 if n.type in ('meetup_request','meetup_accepted') then
 return spotted_private.audience_allows(n.sender_id,n.receiver_id,'mutual_friends');end if;
 if n.type in ('friend_accepted','invite_accepted','venue_invite','venue_invite_accepted') then
 return spotted_private.direct_friend(n.sender_id,n.receiver_id);end if;
 if n.type in ('daily_nudge_first','daily_nudge_second','weekend_rally','morning_after') then return n.sender_id=n.receiver_id;end if;
 return false; -- Includes parked Yap and unrecognized/source-less types.
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end $function$
;
-- One event per genuine transition, with one transaction for the status and
-- fanout. Retries of an unchanged save do not retrigger; a later TBD -> OUT does.
create or replace function spotted_private.notify_night_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; kind text; sender_name text; event uuid:=gen_random_uuid(); moving boolean:=false;
begin
 if new.expires_at<=now() or new.status not in ('out','planning') or coalesce(new.is_demo,false) then return new;end if;
 if tg_op='UPDATE' then
  if old.status is not distinct from new.status and old.expires_at is not distinct from new.expires_at
   and old.venue_id is not distinct from new.venue_id and old.is_private_party is not distinct from new.is_private_party then return new;end if;
  moving:=old.status='out' and new.status='out' and old.expires_at=new.expires_at;
 end if;
 kind:=case when new.status='planning' then 'friend_planning' when moving then 'friend_arrived_venue' else 'friend_out' end;
 if moving and (new.venue_id is null or coalesce(new.is_private_party,false)) then return new;end if;
 select split_part(coalesce(nullif(display_name,''),'A friend'),' ',1) into sender_name from public.profiles where id=new.user_id;
 for recipient in
  select p.id,coalesce(pref.out_scope,'all') out_scope,coalesce(pref.moves_scope,'close') moves_scope,
    exists(select 1 from public.close_friends c where c.user_id=p.id and c.close_friend_id=new.user_id) is_close
  from public.profiles p left join public.notification_preferences pref on pref.user_id=p.id
  where p.id<>new.user_id and not coalesce(p.is_demo,false)
  and spotted_private.direct_friend(p.id,new.user_id)
  and spotted_private.viewer_participates(p.id)
  and spotted_private.location_audience(p.id,new.user_id,case when new.status='planning'
    then coalesce(new.planning_visibility,(select location_sharing_level from public.profiles where id=new.user_id),'all_friends')
    else (select location_sharing_level from public.profiles where id=new.user_id) end)
 loop
  if (case when moving then recipient.moves_scope else recipient.out_scope end)='none'
    or ((case when moving then recipient.moves_scope else recipient.out_scope end)='close' and not recipient.is_close) then continue;end if;
  if moving and (exists(select 1 from spotted_private.activity_deliveries d where d.owner_id=new.user_id and d.receiver_id=recipient.id and d.moving and d.created_at>now()-interval '30 minutes')
    or (select count(*) from spotted_private.activity_deliveries d where d.owner_id=new.user_id and d.receiver_id=recipient.id and d.night_expiry=new.expires_at and d.moving)>=3) then continue;end if;
  insert into spotted_private.activity_deliveries(owner_id,receiver_id,night_expiry,moving) values(new.user_id,recipient.id,new.expires_at,moving);
  insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
  values(new.user_id,recipient.id,kind,'Spotted. '||sender_name||case when new.status='planning' then ' is TBD tonight'
    when new.venue_name is not null and not coalesce(new.is_private_party,false) then ' is out at '||new.venue_name else ' is out tonight' end,
    jsonb_build_object('night_expiry',new.expires_at::text,'venue_id',case when moving then new.venue_id else null end)
    ||case when new.status='out' and new.venue_id is not null and not coalesce(new.is_private_party,false)
      then jsonb_build_object('status_venue_id',new.venue_id::text) else '{}'::jsonb end,
    'status:'||event::text||':'||recipient.id::text) on conflict do nothing;
 end loop;
 return new;
end $$;
revoke all on function spotted_private.notify_night_activity() from public,anon,authenticated;

-- The client and server now share a daily 6pm opening, including weekends.
create or replace function public.night_mode_opens_at(p_city text,p_at timestamptz default now())
returns timestamptz language sql stable set search_path='' as $$
 select (x.d+interval '18 hours') at time zone x.tz
 from (select z.tz,((p_at at time zone z.tz)-interval '5 hours')::date::timestamp d
 from (select case p_city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end tz) z) x
$$;

-- Client generated IDs make lost-response retries safe. Invoker security keeps
-- all existing membership, private media and message pointer guards in force.
create or replace function public.send_dm_once(p_id uuid,p_thread uuid,p_text text,p_image text default null)
returns setof public.dm_messages language plpgsql security invoker set search_path='' as $$
declare existing public.dm_messages;
begin
 if auth.uid() is null or p_id is null or p_thread is null then raise exception 'Authentication required' using errcode='42501';end if;
 if length(coalesce(p_text,''))>2000 or (btrim(coalesce(p_text,''))='' and p_image is null) then raise exception 'Message is empty or too long' using errcode='22023';end if;
 insert into public.dm_messages(id,thread_id,sender_id,text,image_url) values(p_id,p_thread,auth.uid(),coalesce(p_text,''),p_image) on conflict(id) do nothing;
 select * into existing from public.dm_messages where id=p_id and sender_id=auth.uid() and thread_id=p_thread;
 if not found or existing.text is distinct from coalesce(p_text,'') or existing.image_url is distinct from p_image then raise exception 'Message unavailable' using errcode='42501';end if;
 if existing.created_at < public.night_start_at((select city from public.profiles where id=auth.uid()),now()) then raise exception 'Message expired' using errcode='22023';end if;
 return next existing;
end $$;
revoke all on function public.send_dm_once(uuid,uuid,text,text) from public,anon;
grant execute on function public.send_dm_once(uuid,uuid,text,text) to authenticated;
commit;
