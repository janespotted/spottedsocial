-- Spotted voice for future activity notifications; retain all audience and location safeguards.
create or replace function spotted_private.notify_night_activity() returns trigger language plpgsql security definer set search_path='' as $$
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
    when 'friend_out' then ' Spotted out tonight'
    when 'friend_planning' then ' is deciding where to go tonight'
    else ' Spotted at '||new.venue_name end,
    jsonb_build_object('night_expiry',night,'venue_id',case when kind='friend_arrived_venue' then new.venue_id else null end),event) on conflict do nothing;
 end loop;
 return new;
end $$;
