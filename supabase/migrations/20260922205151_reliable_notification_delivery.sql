-- Delivery stays disabled until the release operator configures the worker.
-- No historical notification backfill: enabling never replays old alerts.
create schema if not exists spotted_private;
revoke all on schema spotted_private from public, anon, authenticated;
create table spotted_private.push_settings (
  singleton boolean primary key default true check(singleton),
  delivery_enabled boolean not null default false,
  campaigns_enabled boolean not null default false
);
insert into spotted_private.push_settings default values;
alter table spotted_private.push_settings enable row level security;

alter table public.notifications add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists event_key text;
create unique index if not exists notifications_event_key on public.notifications(event_key) where event_key is not null;
create table public.push_outbox (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','sending','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  channels jsonb not null default '{}'::jsonb,
  completed_at timestamptz
);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public, anon, authenticated;
grant all on public.push_outbox to service_role;
create index push_outbox_due on public.push_outbox(available_at) where state in ('pending','sending');

-- Internal helpers deliberately do not depend on auth.uid(): recipients are
-- evaluated inside triggers and the service worker. No client EXECUTE grants.
create function spotted_private.direct_friend(a uuid,b uuid) returns boolean
language sql stable set search_path = '' as $$
 select exists(select 1 from public.friendships where status='accepted'
 and ((user_id=a and friend_id=b) or (user_id=b and friend_id=a)))
$$;
create function spotted_private.audience_allows(viewer uuid, owner_id uuid, audience text) returns boolean
language sql stable set search_path = '' as $$
 select viewer=owner_id or case audience
 when 'close_friends' then exists(select 1 from public.close_friends where user_id=owner_id and close_friend_id=viewer)
 when 'all_friends' then spotted_private.direct_friend(viewer,owner_id)
 when 'mutual_friends' then spotted_private.direct_friend(viewer,owner_id) or exists(
   select 1 from public.friendships f join public.profiles p
   on p.id=case when f.user_id=owner_id then f.friend_id else f.user_id end
   where f.status='accepted' and (f.user_id=owner_id or f.friend_id=owner_id)
   and not coalesce(p.is_demo,false) and spotted_private.direct_friend(viewer,p.id))
 else false end
$$;
create function spotted_private.blocked(a uuid,b uuid) returns boolean
language sql stable set search_path = '' as $$
 select exists(select 1 from public.blocked_users where
 (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))
$$;
create function spotted_private.post_visible(viewer uuid, post_id uuid) returns boolean
language sql stable set search_path = '' as $$
 select exists(select 1 from public.posts p where p.id=post_id
 and (p.expires_at is null or p.expires_at>now())
 and not spotted_private.blocked(viewer,p.user_id)
 and spotted_private.audience_allows(viewer,p.user_id,p.visibility))
$$;
create function spotted_private.notification_allowed(n public.notifications) returns boolean
language plpgsql stable set search_path = '' as $$
begin
 if n.is_demo is true or spotted_private.blocked(n.sender_id,n.receiver_id) then return false; end if;
 if exists(select 1 from public.profiles where id in(n.sender_id,n.receiver_id) and is_demo is true) then return false; end if;
 if n.type in ('post_tag','post_like','post_comment') then
   return n.data ? 'post_id' and spotted_private.post_visible(n.receiver_id,(n.data->>'post_id')::uuid);
 end if;
 if n.type='dm' then
   return n.data ? 'thread_id' and exists(select 1 from public.dm_thread_members
      where thread_id=(n.data->>'thread_id')::uuid and user_id=n.receiver_id);
 end if;
 if n.type in ('friend_checkin','friend_arrived','friend_arrived_venue','friends_at_venue','friend_planning') then
   return exists(select 1 from public.profiles p where p.id=n.sender_id
     and spotted_private.audience_allows(n.receiver_id,n.sender_id,p.location_sharing_level))
     and not exists(select 1 from public.location_hidden where user_id=n.sender_id and hidden_from_id=n.receiver_id)
     and exists(select 1 from public.night_statuses s where s.user_id=n.sender_id and s.expires_at>now()
       and ((n.type='friend_planning' and s.status='planning') or
            (n.type<>'friend_planning' and s.status='out' and not coalesce(s.is_private_party,false)
             and n.data->>'venue_id'=s.venue_id::text)));
 end if;
 if n.type in ('daily_nudge_first','daily_nudge_second','weekend_rally') then
   return not exists(select 1 from public.night_statuses s where s.user_id=n.receiver_id and s.expires_at>now());
 end if;
 return true;
end $$;

create function spotted_private.enqueue_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if spotted_private.notification_allowed(new) then
   insert into public.push_outbox(notification_id,expires_at)
   values(new.id,now()+case when new.type in ('friend_request','friend_accepted') then interval '24 hours' else interval '2 hours' end)
   on conflict do nothing;
   if new.type not in ('friend_request','friend_accepted') then
     update public.push_outbox q set expires_at=least(q.expires_at,
       ((case when (now() at time zone z.tz)::time < time '05:00'
         then (now() at time zone z.tz)::date else (now() at time zone z.tz)::date+1 end)+time '05:00') at time zone z.tz)
     from (select case when city='la' then 'America/Los_Angeles' else 'America/New_York' end tz
           from public.profiles where id=new.sender_id) z where q.notification_id=new.id;
   end if;
   -- pg_net dispatches after commit. Wake once per transaction for prompt DMs;
   -- cron is the recovery path if the wake request fails.
   if current_setting('spotted.push_wake',true) is distinct from '1' then
     perform set_config('spotted.push_wake','1',true);
     begin perform spotted_private.wake_push_worker();
     exception when others then raise warning 'Push wake deferred to cron'; end;
   end if;
 end if;
 return new;
end $$;
create trigger enqueue_push after insert on public.notifications for each row execute function spotted_private.enqueue_push();

-- The notification row and source action commit together. A failure rolls back
-- the action so the user can retry, rather than silently losing its alert.
create or replace function public.notify_post_liked() returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; name text;
begin
 select user_id into owner_id from public.posts where id=new.post_id;
 if owner_id=new.user_id or spotted_private.blocked(owner_id,new.user_id) then return new; end if;
 select display_name into name from public.profiles where id=new.user_id;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(new.user_id,owner_id,'post_like',coalesce(name,'Someone') || ' liked your post ❤️',
 jsonb_build_object('post_id',new.post_id),'like:'||new.post_id||':'||new.user_id) on conflict do nothing;
 return new;
end $$;
create or replace function public.notify_post_commented() returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; name text;
begin
 select user_id into owner_id from public.posts where id=new.post_id;
 if owner_id=new.user_id or spotted_private.blocked(owner_id,new.user_id) then return new; end if;
 select display_name into name from public.profiles where id=new.user_id;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(new.user_id,owner_id,'post_comment',coalesce(name,'Someone') || ' commented: ' || left(new.text,100),
 jsonb_build_object('post_id',new.post_id),'comment:'||new.id) on conflict do nothing;
 return new;
end $$;
create function spotted_private.notify_friend_accepted() returns trigger language plpgsql security definer set search_path = '' as $$
declare name text;
begin
 if new.status='accepted' and old.status is distinct from new.status
 and not spotted_private.blocked(new.user_id,new.friend_id) then
 select display_name into name from public.profiles where id=new.friend_id;
 insert into public.notifications(sender_id,receiver_id,type,message,event_key)
 values(new.friend_id,new.user_id,'friend_accepted',coalesce(name,'Someone')||' accepted your friend request!',
 'friend-accepted:'||new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger push_friend_accepted after update on public.friendships for each row execute function spotted_private.notify_friend_accepted();
create function spotted_private.notify_tag() returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; name text;
begin
 select user_id into owner_id from public.posts where id=new.post_id;
 if owner_id=new.tagged_user_id or not spotted_private.post_visible(new.tagged_user_id,new.post_id) then return new; end if;
 select display_name into name from public.profiles where id=owner_id;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(owner_id,new.tagged_user_id,'post_tag',coalesce(name,'Someone')||' tagged you in a post',
 jsonb_build_object('post_id',new.post_id),'tag:'||new.post_id||':'||new.tagged_user_id) on conflict do nothing;
 return new;
end $$;
create trigger push_post_tag after insert on public.post_tags for each row execute function spotted_private.notify_tag();
create function spotted_private.notify_dm() returns trigger language plpgsql security definer set search_path = '' as $$
declare name text;
begin
 select display_name into name from public.profiles where id=new.sender_id;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 select new.sender_id,m.user_id,'dm',coalesce(name,'Someone')||': '||
 case when new.image_url is not null then '📷 Photo'
 when new.text like '[shared_post:%' then 'Shared a post'
 else left(coalesce(new.text,'New message'),100) || case when length(new.text)>100 then '…' else '' end end,
 jsonb_build_object('thread_id',new.thread_id),'dm:'||new.id||':'||m.user_id
 from public.dm_thread_members m where m.thread_id=new.thread_id and m.user_id<>new.sender_id
 and not spotted_private.blocked(new.sender_id,m.user_id) on conflict do nothing;
 return new;
end $$;
create trigger push_dm after insert on public.dm_messages for each row execute function spotted_private.notify_dm();

-- Older app/web builds still call these RPCs after the action. Ignore types
-- now owned by DB triggers, preventing duplicate rows and forged post tags.
create or replace function public.create_notification(p_receiver_id uuid,p_type text,p_message text)
returns setof public.notifications language plpgsql security definer set search_path = '' as $$
declare metadata jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if p_type in ('post_like','post_comment','post_tag','friend_accepted','dm','daily_nudge_first','daily_nudge_second','weekend_rally') then return; end if;
 if spotted_private.blocked(auth.uid(),p_receiver_id) then return; end if;
 if length(p_message) not between 1 and 500 then raise exception 'Invalid notification message'; end if;
 if p_type in ('friend_checkin','friend_arrived','friend_arrived_venue','friends_at_venue') then
   select jsonb_build_object('venue_id',venue_id) into metadata from public.night_statuses where user_id=auth.uid() and expires_at>now();
 end if;
 return query insert into public.notifications(sender_id,receiver_id,type,message,data)
 values(auth.uid(),p_receiver_id,p_type,p_message,coalesce(metadata,'{}'::jsonb)) returning *;
end $$;
create or replace function public.create_notifications_batch(p_notifications jsonb)
returns setof public.notifications language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if jsonb_array_length(p_notifications)>100 then raise exception 'Too many recipients'; end if;
 for item in select * from jsonb_array_elements(p_notifications) loop
 return query select * from public.create_notification((item->>'receiver_id')::uuid,item->>'type',item->>'message');
 end loop;
end $$;
revoke all on function public.create_notification(uuid,text,text),public.create_notifications_batch(jsonb) from public,anon;
grant execute on function public.create_notification(uuid,text,text),public.create_notifications_batch(jsonb) to authenticated;

-- Resolve actual Friends + Mutuals on the server (including direct friends).
create function public.get_planning_notification_recipients() returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); result uuid[];
begin
 if uid is null then raise exception 'Not authenticated'; end if;
 select array_agg(p.id) into result from public.profiles p join public.profiles owner on owner.id=uid
 where p.id<>uid and not coalesce(p.is_demo,false)
 and spotted_private.audience_allows(p.id,uid,owner.location_sharing_level)
 and not spotted_private.blocked(p.id,uid)
 and not exists(select 1 from public.location_hidden where user_id=uid and hidden_from_id=p.id);
 return coalesce(result,'{}'::uuid[]);
end $$;
revoke all on function public.get_planning_notification_recipients() from public,anon;
grant execute on function public.get_planning_notification_recipients() to authenticated;

-- Service-only queue operations. Claims are atomic and lease-protected.
create function public.claim_push_batch() returns setof public.push_outbox
language plpgsql security definer set search_path = '' as $$
begin
 if not (select delivery_enabled from spotted_private.push_settings) then return; end if;
 update public.push_outbox set state='skipped',last_error='expired',completed_at=now()
 where state in ('pending','sending') and expires_at<=now();
 update public.push_outbox set state='failed',last_error='attempt limit',completed_at=now()
 where state in ('pending','sending') and attempts>=5 and coalesce(lease_until,now())<=now();
 return query with due as (
 select notification_id from public.push_outbox where expires_at>now() and attempts<5
 and ((state='pending' and available_at<=now()) or (state='sending' and lease_until<now()))
 order by available_at for update skip locked limit 20)
 update public.push_outbox q set state='sending',attempts=q.attempts+1,
 lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 from due where q.notification_id=due.notification_id returning q.*;
end $$;
create function public.finish_push(p_id uuid,p_lease uuid,p_state text,p_error text,p_channels jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_state not in ('sent','skipped','pending') then raise exception 'Invalid state'; end if;
 update public.push_outbox set state=case when p_state='pending' and attempts>=5 then 'failed' else p_state end,
 last_error=left(p_error,300),channels=p_channels,lease_until=null,
 available_at=now()+make_interval(secs=>least(1800,30*power(2,attempts)::int)),
 completed_at=case when p_state<>'pending' or attempts>=5 then now() else null end
 where notification_id=p_id and lease_id=p_lease and state='sending';
end $$;
create function public.push_notification_allowed(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce((select spotted_private.notification_allowed(n) from public.notifications n where id=p_id),false)
$$;
revoke all on function public.claim_push_batch(),public.finish_push(uuid,uuid,text,text,jsonb),public.push_notification_allowed(uuid) from public,anon,authenticated;
grant execute on function public.claim_push_batch(),public.finish_push(uuid,uuid,text,text,jsonb),public.push_notification_allowed(uuid) to service_role;
revoke all on all functions in schema spotted_private from public,anon,authenticated;
revoke all on function public.notify_post_liked(),public.notify_post_commented() from public,anon,authenticated;
-- City-local campaigns, disabled until explicitly enabled at release.
create function public.enqueue_scheduled_pushes() returns integer language plpgsql security definer set search_path = '' as $$
declare p record; wall timestamp; kind text; count_inserted integer:=0; added integer;
begin
 if not (select delivery_enabled and campaigns_enabled from spotted_private.push_settings) then return 0; end if;
 for p in select id,city from public.profiles where push_enabled is true and not coalesce(is_demo,false)
   and (apns_device_token is not null or push_subscription is not null) and city in ('nyc','la','lhr') loop
   -- lhr is the hidden test city (only reachable with demo mode on); Asia/Karachi has no DST.
   wall:=now() at time zone case p.city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end;
   kind:=null;
   if extract(minute from wall)>=15 then continue; end if;
   if extract(hour from wall)=17 and extract(isodow from wall)=5 then kind:='weekend_rally';
   elsif extract(hour from wall)=18 and extract(isodow from wall)<>5 then kind:='daily_nudge_first';
   elsif extract(hour from wall)=20 and exists(
     select 1 from public.notifications n join public.push_outbox q on q.notification_id=n.id and q.state='sent'
     where n.receiver_id=p.id and n.event_key='campaign:first:'||p.id||':'||wall::date) then kind:='daily_nudge_second';
   end if;
   if kind is null or exists(select 1 from public.night_statuses where user_id=p.id and expires_at>now()) then continue; end if;
   insert into public.notifications(sender_id,receiver_id,type,message,event_key)
   values(p.id,p.id,kind,case when kind='weekend_rally' then 'Make a plan with your friends for tonight.' else 'Going out tonight? Let your friends know.' end,
   'campaign:'||case when kind='daily_nudge_second' then 'second' else 'first' end||':'||p.id||':'||wall::date)
   on conflict do nothing;
   get diagnostics added = row_count;
   count_inserted:=count_inserted+added;
 end loop;
 return count_inserted;
end $$;
revoke all on function public.enqueue_scheduled_pushes() from public,anon,authenticated;
grant execute on function public.enqueue_scheduled_pushes() to service_role;

-- Vault values: spotted_push_url (project base URL), spotted_push_service_key.
create function spotted_private.wake_push_worker() returns void language plpgsql security definer set search_path = '' as $$
declare endpoint text; secret text;
begin
 if not (select delivery_enabled from spotted_private.push_settings) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='spotted_push_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='spotted_push_service_key';
 if endpoint is null or secret is null then raise exception 'Configure push worker Vault secrets before enabling'; end if;
 perform net.http_post(url:=endpoint||'/functions/v1/process-push-queue',
 headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function spotted_private.wake_push_worker() from public,anon,authenticated;
select cron.schedule('spotted-push-delivery','* * * * *','select spotted_private.wake_push_worker()');
select cron.schedule('spotted-push-campaigns','*/5 * * * *','select public.enqueue_scheduled_pushes()');
