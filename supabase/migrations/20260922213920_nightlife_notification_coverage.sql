-- Requires reliable_notification_delivery. No historical notifications emitted.
create table public.notification_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 out_scope text not null default 'all' check(out_scope in ('all','close','none')),
 moves_scope text not null default 'close' check(moves_scope in ('all','close','none'))
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create policy own_preferences on public.notification_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function spotted_private.social_visible(viewer uuid,owner_id uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.profiles where id=viewer and not coalesce(is_demo,false))
 and exists(select 1 from public.profiles where id=owner_id and not coalesce(is_demo,false))
 and not spotted_private.blocked(viewer,owner_id)
 and not exists(select 1 from public.location_hidden where user_id=owner_id and hidden_from_id=viewer)
 and exists(select 1 from public.profiles where id=owner_id and spotted_private.audience_allows(viewer,owner_id,location_sharing_level))
$$;
create function spotted_private.wants_activity(viewer uuid,owner_id uuid,moving boolean) returns boolean
language sql stable set search_path='' as $$
 select case coalesce((select case when moving then moves_scope else out_scope end from public.notification_preferences where user_id=viewer),case when moving then 'close' else 'all' end)
 when 'none' then false when 'close' then exists(select 1 from public.close_friends where user_id=viewer and close_friend_id=owner_id)
 else true end
$$;

create table public.party_requests(
 id uuid primary key default gen_random_uuid(),
 status_id uuid not null,
 host_id uuid not null references public.profiles(id) on delete cascade,
 guest_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('invite','address')),
 state text not null default 'pending' check(state in ('pending','accepted','declined')),
 expires_at timestamptz not null,
 unique(status_id,host_id,guest_id,kind,expires_at)
);
alter table public.party_requests enable row level security;
revoke all on public.party_requests from public,anon,authenticated;
grant select on public.party_requests to authenticated;
create policy party_participants on public.party_requests for select to authenticated
 using((host_id=(select auth.uid()) or guest_id=(select auth.uid())) and expires_at>now());
create index party_requests_host on public.party_requests(host_id,expires_at);
create index party_requests_guest on public.party_requests(guest_id,expires_at);

alter function spotted_private.notification_allowed(public.notifications) rename to notification_allowed_core;
create function spotted_private.notification_allowed(n public.notifications) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if n.type in ('friend_out','friend_planning','friend_arrived_venue') then
  return not coalesce(n.is_demo,false)
   and spotted_private.social_visible(n.receiver_id,n.sender_id)
   and spotted_private.wants_activity(n.receiver_id,n.sender_id,n.type='friend_arrived_venue')
   and (n.type<>'friend_arrived_venue' or exists(select 1 from public.night_statuses viewer where viewer.user_id=n.receiver_id and viewer.status in ('out','planning') and viewer.expires_at>now()))
   and exists(select 1 from public.night_statuses s where s.user_id=n.sender_id and s.expires_at>now()
    and s.expires_at=(n.data->>'night_expiry')::timestamptz
    and ((n.type='friend_planning' and s.status='planning') or (n.type='friend_out' and s.status='out')
    or (n.type='friend_arrived_venue' and s.status='out' and not coalesce(s.is_private_party,false) and s.venue_id::text=n.data->>'venue_id')));
 end if;
 if n.type in ('private_party_invite','address_request','party_invite_accepted','party_address_approved') then
  return exists(select 1 from public.party_requests pr join public.night_statuses s on s.id=pr.status_id and s.user_id=pr.host_id
   where pr.id::text=n.data->>'request_id' and pr.expires_at>now() and s.expires_at=pr.expires_at
   and s.status='out' and s.is_private_party is true
   and spotted_private.social_visible(pr.guest_id,pr.host_id)
   and spotted_private.direct_friend(pr.host_id,pr.guest_id)
   and ((n.type in ('private_party_invite','address_request') and pr.state='pending')
     or (n.type in ('party_invite_accepted','party_address_approved') and pr.state='accepted')));
 end if;
 return spotted_private.notification_allowed_core(n);
end $$;

create function spotted_private.notify_night_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record; first_out boolean; kind text; name text; event text; night text; changed boolean;
begin
 if new.expires_at<=now() or new.status not in ('out','planning') or coalesce(new.is_demo,false) then return new; end if;
 if tg_op='UPDATE' then
  changed:= old.status is distinct from new.status or old.expires_at is distinct from new.expires_at
   or old.venue_id is distinct from new.venue_id or old.is_private_party is distinct from new.is_private_party;
  if not changed then return new; end if;
 end if;
 night:=new.expires_at::text;
 select display_name into name from public.profiles where id=new.user_id;
 -- Source event survives receiver deletion of their inbox notifications.
 insert into spotted_private.night_events(owner_id,night_expiry,kind,venue_key)
 values(new.user_id,new.expires_at,case when new.status='planning' then 'planning' else 'out' end,'first') on conflict do nothing;
 first_out:=found;
 if new.status='planning' then
  if not first_out then return new; end if; kind:='friend_planning';
 elsif first_out then kind:='friend_out';
 else
  if new.venue_id is null or coalesce(new.is_private_party,false) then return new; end if;
  insert into spotted_private.night_events(owner_id,night_expiry,kind,venue_key)
  values(new.user_id,new.expires_at,'move',new.venue_id::text) on conflict do nothing;
  if not found then return new; end if;
  kind:='friend_arrived_venue';
 end if;
 -- Mark first venue too: going back to the first bar is not another arrival.
 if kind='friend_out' and new.venue_id is not null then
  insert into spotted_private.night_events values(new.user_id,new.expires_at,'move',new.venue_id::text) on conflict do nothing;
 end if;
 for recipient in select p.id from public.profiles p where p.id<>new.user_id and not coalesce(p.is_demo,false)
   and spotted_private.social_visible(p.id,new.user_id)
   and spotted_private.wants_activity(p.id,new.user_id,kind='friend_arrived_venue')
   order by exists(select 1 from public.close_friends c where c.user_id=p.id and c.close_friend_id=new.user_id) desc,p.id loop
  if kind='friend_arrived_venue' and (
    not exists(select 1 from public.night_statuses viewer where viewer.user_id=recipient.id and viewer.status in ('out','planning') and viewer.expires_at>now())
    or exists(select 1 from public.night_statuses s where s.user_id=recipient.id and s.venue_id=new.venue_id and s.status='out' and s.expires_at>now())
    or (select count(*) from spotted_private.activity_deliveries where owner_id=new.user_id and receiver_id=recipient.id and night_expiry=new.expires_at and moving)>=3
    or exists(select 1 from spotted_private.activity_deliveries where owner_id=new.user_id and receiver_id=recipient.id and moving and created_at>now()-interval '30 minutes')
  ) then continue; end if;
  insert into spotted_private.activity_deliveries(owner_id,receiver_id,night_expiry,moving) values(new.user_id,recipient.id,new.expires_at,kind='friend_arrived_venue');
  event:=kind||':'||new.user_id||':'||recipient.id||':'||night||':'||case when kind='friend_arrived_venue' then new.venue_id::text else 'first' end;
  insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
  values(new.user_id,recipient.id,kind,coalesce(name,'A friend')||case kind
    when 'friend_out' then ' is out tonight'
    when 'friend_planning' then ' is deciding where to go tonight'
    else ' just got to '||new.venue_name end,
    jsonb_build_object('night_expiry',night,'venue_id',case when kind='friend_arrived_venue' then new.venue_id else null end),event) on conflict do nothing;
 end loop;
 return new;
end $$;
create table spotted_private.night_events(owner_id uuid,night_expiry timestamptz,kind text,venue_key text,primary key(owner_id,night_expiry,kind,venue_key));
create table spotted_private.activity_deliveries(owner_id uuid,receiver_id uuid,night_expiry timestamptz,moving boolean,created_at timestamptz default now());
alter table spotted_private.night_events enable row level security;
alter table spotted_private.activity_deliveries enable row level security;
create index activity_deliveries_limit on spotted_private.activity_deliveries(owner_id,receiver_id,night_expiry);
create trigger nightlife_notifications after insert or update on public.night_statuses for each row execute function spotted_private.notify_night_activity();
select cron.schedule('spotted-activity-dedupe-cleanup','17 * * * *','delete from spotted_private.night_events where night_expiry<now()-interval ''1 day''; delete from spotted_private.activity_deliveries where night_expiry<now()-interval ''1 day''; delete from public.party_requests where expires_at<now()-interval ''1 day'';');

-- New calls for social/party types must originate from their source actions.
alter function public.create_notification(uuid,text,text) rename to create_notification_core;
revoke all on function public.create_notification_core(uuid,text,text) from public,anon,authenticated;
create function public.create_notification(p_receiver_id uuid,p_type text,p_message text)
returns setof public.notifications language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_type in ('friend_request','friend_out','friend_planning','friend_arrived','friend_arrived_venue','friend_checkin','private_party_invite','address_request','party_invite_accepted','party_address_approved') then return; end if;
 return query select * from public.create_notification_core(p_receiver_id,p_type,p_message);
end $$;
revoke all on function public.create_notification(uuid,text,text) from public,anon;
grant execute on function public.create_notification(uuid,text,text) to authenticated;

create function public.party_request(p_host uuid,p_guest uuid,p_kind text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.night_statuses; rid uuid; sender uuid:=auth.uid(); receiver uuid; name text;
begin
 if sender is null then raise exception 'Not authenticated'; end if;
 if p_host=p_guest or not spotted_private.direct_friend(p_host,p_guest) or not spotted_private.social_visible(p_guest,p_host) then raise exception 'Not available'; end if;
 if (p_kind='invite' and sender<>p_host) or (p_kind='address' and sender<>p_guest) or p_kind not in ('invite','address') then raise exception 'Not permitted'; end if;
 select * into s from public.night_statuses where user_id=p_host and status='out' and is_private_party is true and expires_at>now();
 if s.id is null then raise exception 'Party has ended'; end if;
 insert into public.party_requests(status_id,host_id,guest_id,kind,expires_at) values(s.id,p_host,p_guest,p_kind,s.expires_at)
 on conflict do nothing returning id into rid;
 if rid is null then select id into rid from public.party_requests where status_id=s.id and host_id=p_host and guest_id=p_guest and kind=p_kind and expires_at=s.expires_at;return rid; end if;
 receiver:=case when p_kind='invite' then p_guest else p_host end;
 select display_name into name from public.profiles where id=sender;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(sender,receiver,case when p_kind='invite' then 'private_party_invite' else 'address_request' end,
 coalesce(name,'A friend')||case when p_kind='invite' then ' invited you to a private party' else ' requested your party address' end,
 jsonb_build_object('host_id',p_host,'request_id',rid),'party-request:'||rid);
 return rid;
end $$;
create function public.respond_party_request(p_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare pr public.party_requests; receiver uuid; name text;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_accept is null then raise exception 'Choose accept or decline'; end if;
 select * into pr from public.party_requests where id=p_id for update;
 if pr.id is null or auth.uid()<>(case when pr.kind='invite' then pr.guest_id else pr.host_id end) then raise exception 'Not permitted'; end if;
 if pr.state<>'pending' then return; end if;
 if pr.expires_at<=now() or not spotted_private.social_visible(pr.guest_id,pr.host_id)
 or not exists(select 1 from public.night_statuses where id=pr.status_id and user_id=pr.host_id and expires_at=pr.expires_at and status='out' and is_private_party is true) then raise exception 'Party has ended'; end if;
 if p_accept and pr.kind='address' and not exists(select 1 from public.night_statuses where id=pr.status_id and nullif(trim(party_address),'') is not null) then raise exception 'Save your address first'; end if;
 update public.party_requests set state=case when p_accept then 'accepted' else 'declined' end where id=p_id;
 if not p_accept then return; end if;
 receiver:=case when pr.kind='invite' then pr.host_id else pr.guest_id end;
 select display_name into name from public.profiles where id=auth.uid();
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(auth.uid(),receiver,case when pr.kind='invite' then 'party_invite_accepted' else 'party_address_approved' end,
 coalesce(name,'A friend')||case when pr.kind='invite' then ' accepted your party invitation' else ' shared their party address with you' end,
 jsonb_build_object('host_id',pr.host_id,'request_id',pr.id),'party-response:'||pr.id) on conflict do nothing;
end $$;
create function public.approved_party_address(p_host uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare result text;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 select s.party_address into result from public.night_statuses s where s.user_id=p_host and s.status='out' and s.is_private_party is true and s.expires_at>now()
 and (auth.uid()=p_host or (spotted_private.social_visible(auth.uid(),p_host) and spotted_private.direct_friend(auth.uid(),p_host)
 and exists(select 1 from public.party_requests pr where pr.host_id=p_host and pr.guest_id=auth.uid() and pr.status_id=s.id and pr.expires_at=s.expires_at and pr.kind='address' and pr.state='accepted')));
 return result;
end $$;
revoke all on function public.party_request(uuid,uuid,text),public.respond_party_request(uuid,boolean),public.approved_party_address(uuid) from public,anon;
grant execute on function public.party_request(uuid,uuid,text),public.respond_party_request(uuid,boolean),public.approved_party_address(uuid) to authenticated;
revoke all on all functions in schema spotted_private from public,anon,authenticated;

-- Ending/changing a party must not carry address consent into a new party.
create function spotted_private.revoke_party_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.is_private_party is true and (new.is_private_party is not true or new.status<>'out' or new.expires_at is distinct from old.expires_at) then
  delete from public.party_requests where status_id=old.id and expires_at=old.expires_at;
 elsif new.party_address is distinct from old.party_address then
  delete from public.party_requests where status_id=old.id and kind='address' and state='accepted';
 end if;
 return new;
end $$;
create trigger party_access_cleanup after update on public.night_statuses for each row execute function spotted_private.revoke_party_access();
revoke all on function spotted_private.revoke_party_access() from public,anon,authenticated;

-- Friend requests also originate from the saved relationship, not a second
-- best-effort mobile call after the relationship has already committed.
create function spotted_private.notify_friend_requested() returns trigger language plpgsql security definer set search_path='' as $$
declare name text;
begin
 if new.status<>'pending' or spotted_private.blocked(new.user_id,new.friend_id) then return new; end if;
 select display_name into name from public.profiles where id=new.user_id;
 insert into public.notifications(sender_id,receiver_id,type,message,event_key)
 values(new.user_id,new.friend_id,'friend_request',coalesce(name,'Someone')||' sent you a friend request','friend-request:'||new.id) on conflict do nothing;
 return new;
end $$;
create trigger friend_request_notification after insert on public.friendships for each row execute function spotted_private.notify_friend_requested();
revoke all on function spotted_private.notify_friend_requested() from public,anon,authenticated;
