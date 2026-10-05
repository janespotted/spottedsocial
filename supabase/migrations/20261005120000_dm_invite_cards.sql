-- Venue invites and Meet Up requests become cards in the 1:1 DM thread
-- (mobile/DM-INVITE-CARDS-PLAN.md). The invite row owns its status
-- (pending / accepted / declined). The DM message is only a pointer,
-- "[invite:<id>]" for a venue and "[meetup:<id>]" for a meet up, the same
-- convention as shared posts, so ordering, realtime, unread state and the
-- 5 AM delete come free. The request notification stays in Activity and
-- records the answer in data.status, so an answer given on either surface
-- shows on both. Every write goes through the RPCs below; clients only read.
begin;

create table public.invites(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('venue','meetup')),
 sender_id uuid not null references public.profiles(id) on delete cascade,
 receiver_id uuid not null references public.profiles(id) on delete cascade,
 thread_id uuid not null references public.dm_threads(id) on delete cascade,
 -- Deleting the message (5 AM reset, thread delete) deletes the invite with it.
 message_id uuid not null unique references public.dm_messages(id) on delete cascade,
 -- Venue: where the sender invites them. Meet up: where the receiver was when
 -- asked, only if the sender could already see it; null otherwise.
 venue_id uuid references public.venues(id) on delete set null,
 venue_name text check(venue_name is null or length(venue_name) between 1 and 200),
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 expires_at timestamptz not null,
 check(sender_id<>receiver_id),
 check(kind<>'venue' or venue_name is not null)
);
-- One venue invite per pair, venue and night; one meet up per pair per night
-- in either direction. The RPCs check first and return the existing card.
create unique index invites_venue_once on public.invites(sender_id,receiver_id,venue_id,expires_at) where kind='venue';
create unique index invites_meetup_once on public.invites(least(sender_id,receiver_id),greatest(sender_id,receiver_id),expires_at) where kind='meetup';
create index invites_thread on public.invites(thread_id);
create index invites_receiver on public.invites(receiver_id,expires_at);
create index notifications_invite_id on public.notifications((data->>'invite_id')) where data->>'invite_id' is not null;

-- Readers: the two people, unblocked, until the night ends. A definer helper
-- because spotted_private is closed to clients (same shape as notifications).
create function public.can_read_invite(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.invites i where i.id=p_id
 and auth.uid() in(i.sender_id,i.receiver_id) and i.expires_at>now()
 and not spotted_private.blocked(i.sender_id,i.receiver_id))
$$;
alter table public.invites enable row level security;
revoke all on public.invites from public,anon,authenticated;
grant select on public.invites to authenticated;
create policy invite_participants on public.invites for select to authenticated using(public.can_read_invite(id));
alter publication supabase_realtime add table public.invites;

-- The next 5 AM in the user's city: the moment their DMs are deleted.
create function spotted_private.next_reset_at(p_user uuid) returns timestamptz
language sql stable set search_path='' as $$
 select ((((public.night_start_at(p.city,now()) at time zone z.tz)::date+1)+time '05:00') at time zone z.tz)
 from public.profiles p cross join lateral (select case p.city when 'la' then 'America/Los_Angeles'
   when 'lhr' then 'Asia/Karachi' else 'America/New_York' end tz) z
 where p.id=p_user
$$;
create function spotted_private.first_name(p_user uuid) returns text
language sql stable set search_path='' as $$
 select coalesce((select nullif(split_part(btrim(coalesce(display_name,'')),' ',1),'') from public.profiles where id=p_user),'Someone')
$$;
-- Venue invites are between direct friends; meet ups reach Friends + Mutuals
-- (the rule create_notification has always applied to each).
create function spotted_private.invite_allowed(p_kind text,p_sender uuid,p_receiver uuid) returns boolean
language sql stable set search_path='' as $$
 select not spotted_private.blocked(p_sender,p_receiver)
 and not exists(select 1 from public.profiles where id in(p_sender,p_receiver) and coalesce(is_demo,false))
 and case p_kind when 'venue' then spotted_private.direct_friend(p_sender,p_receiver)
  else spotted_private.audience_allows(p_sender,p_receiver,'mutual_friends') end
$$;

-- Only the RPCs below may post an invite pointer; a hand-written one would
-- point a card at someone else's invite.
create function public.guard_dm_invite_pointer() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and new.text ~ '^\[(invite|meetup):[0-9a-f-]{36}\]$' then
  raise exception 'Invites are sent with their RPCs' using errcode='42501';end if;
 return new;
end $$;
create trigger v1_dm_invite_pointer before insert or update on public.dm_messages
 for each row execute function public.guard_dm_invite_pointer();

-- Post the card: find-or-create the 1:1 thread, the pointer message, the
-- invite row and the request notification (its push carries thread_id, so a
-- tap opens the card). Callers hold the pair's advisory lock.
create function spotted_private.post_invite(p_kind text,p_sender uuid,p_receiver uuid,p_venue_id uuid,p_venue_name text,p_expiry timestamptz)
returns public.invites language plpgsql security definer set search_path='' as $$
declare thread uuid; new_id uuid:=gen_random_uuid(); msg uuid; made public.invites;
begin
 thread:=public.create_dm_thread(p_receiver);
 insert into public.dm_messages(thread_id,sender_id,text)
 values(thread,p_sender,'['||case p_kind when 'venue' then 'invite' else 'meetup' end||':'||new_id||']') returning id into msg;
 insert into public.invites(id,kind,sender_id,receiver_id,thread_id,message_id,venue_id,venue_name,expires_at)
 values(new_id,p_kind,p_sender,p_receiver,thread,msg,p_venue_id,p_venue_name,p_expiry) returning * into made;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(p_sender,p_receiver,case p_kind when 'venue' then 'venue_invite' else 'meetup_request' end,
  spotted_private.first_name(p_sender)||case p_kind when 'venue' then ' invited you to '||p_venue_name||'. Want to go?'
   else ' wants to meet up with you' end,
  jsonb_build_object('invite_id',new_id,'thread_id',thread,'venue_id',p_venue_id,'status','pending'),
  p_kind||'-invite:'||new_id);
 return made;
end $$;

create function public.send_venue_invites(p_venue_id uuid,p_receivers uuid[])
returns table(invite_id uuid,receiver_id uuid,thread_id uuid,created boolean)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid(); v public.venues; r uuid; expiry timestamptz; existing public.invites; made public.invites;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if cardinality(coalesce(p_receivers,'{}'))=0 or cardinality(p_receivers)>50 then raise exception 'Choose 1 to 50 friends';end if;
 select * into v from public.venues where id=p_venue_id;
 if v.id is null then raise exception 'Venue unavailable';end if;
 expiry:=spotted_private.next_reset_at(me);
 if expiry is null then raise exception 'Account unavailable';end if;
 for r in select distinct u from unnest(p_receivers) u where u is not null and u<>me loop
  if not spotted_private.invite_allowed('venue',me,r) then continue;end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text||r::text||v.id::text,43));
  select * into existing from public.invites i where i.kind='venue' and i.sender_id=me and i.receiver_id=r and i.venue_id=v.id and i.expires_at=expiry;
  if existing.id is not null then
   invite_id:=existing.id;receiver_id:=r;thread_id:=existing.thread_id;created:=false;return next;continue;
  end if;
  made:=spotted_private.post_invite('venue',me,r,v.id,v.name,expiry);
  invite_id:=made.id;receiver_id:=r;thread_id:=made.thread_id;created:=true;return next;
 end loop;
end $$;

-- One meet up per pair per night, in either direction. `result` is 'sent',
-- or why not: 'duplicate' (one is waiting), 'already_met' (accepted) or
-- 'declined'; then invite_id/thread_id point at the existing card.
create function public.send_meetup(p_receiver uuid)
returns table(result text,invite_id uuid,thread_id uuid)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid(); existing public.invites; made public.invites; s public.night_statuses;
 v_venue_id uuid; v_venue_name text; expiry timestamptz; legacy text[];
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if p_receiver is null or p_receiver=me or not spotted_private.invite_allowed('meetup',me,p_receiver) then
  raise exception 'This person is no longer available for this request.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me,p_receiver)::text||greatest(me,p_receiver)::text,44));
 select * into existing from public.invites i where i.kind='meetup' and i.expires_at>now()
  and ((i.sender_id=me and i.receiver_id=p_receiver) or (i.sender_id=p_receiver and i.receiver_id=me))
  order by (i.status='accepted') desc,i.created_at desc limit 1;
 if existing.id is not null then
  result:=case existing.status when 'accepted' then 'already_met' when 'declined' then 'declined' else 'duplicate' end;
  invite_id:=existing.id;thread_id:=existing.thread_id;return next;return;
 end if;
 -- A request an older build sent tonight (a notification with no card)
 select array_agg(x.type) into legacy from public.notifications x join public.profiles p on p.id=me
  where x.type in('meetup_request','meetup_accepted') and not (x.data ? 'invite_id')
  and ((x.sender_id=me and x.receiver_id=p_receiver) or (x.sender_id=p_receiver and x.receiver_id=me))
  and x.created_at>=public.night_start_at(p.city,now());
 if legacy is not null then
  result:=case when 'meetup_accepted'=any(legacy) then 'already_met' else 'duplicate' end;
  return next;return;
 end if;
 -- Meet them where they are, when the sender may already see that spot.
 select * into s from public.night_statuses ns where ns.user_id=p_receiver and ns.status='out' and ns.expires_at>now()
  and ns.venue_id is not null and not coalesce(ns.is_private_party,false);
 if s.id is not null and spotted_private.location_audience(me,p_receiver,(select location_sharing_level from public.profiles where id=p_receiver)) then
  v_venue_id:=s.venue_id;
  v_venue_name:=coalesce(nullif(btrim(s.venue_name),''),(select name from public.venues where id=s.venue_id));
 end if;
 expiry:=spotted_private.next_reset_at(me);
 if expiry is null then raise exception 'Account unavailable';end if;
 made:=spotted_private.post_invite('meetup',me,p_receiver,v_venue_id,v_venue_name,expiry);
 result:='sent';invite_id:=made.id;thread_id:=made.thread_id;return next;
end $$;

-- Answer: receiver only, once. A second call returns the saved answer, so a
-- double tap or answering on the other surface is harmless. The request
-- notification keeps the answer (Activity shows it); the sender gets a push.
create function public.respond_to_invite(p_invite uuid,p_accept boolean)
returns public.invites language plpgsql security definer set search_path='' as $$
declare i public.invites; first text;
begin
 if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if p_accept is null then raise exception 'Choose accept or decline';end if;
 select * into i from public.invites where id=p_invite for update;
 if i.id is null or i.receiver_id<>auth.uid() then raise exception 'Invite unavailable' using errcode='42501';end if;
 if i.status<>'pending' then return i;end if;
 if i.expires_at<=now() or not spotted_private.invite_allowed(i.kind,i.sender_id,i.receiver_id) then
  raise exception 'Invite unavailable' using errcode='42501';end if;
 update public.invites set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
 where id=i.id returning * into i;
 update public.notifications set data=data||jsonb_build_object('status',i.status)
 where type in('venue_invite','meetup_request') and data->>'invite_id'=i.id::text;
 first:=spotted_private.first_name(i.receiver_id);
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(i.receiver_id,i.sender_id,
  case when i.kind='venue' then case when p_accept then 'venue_invite_accepted' else 'venue_invite_declined' end
   else case when p_accept then 'meetup_accepted' else 'meetup_declined' end end,
  case when i.kind='venue' then case when p_accept then first||' is down for '||i.venue_name||'! 🎉' else first||' can''t make it to '||i.venue_name end
   else case when p_accept then first||' is down to meet up! 🎉' else first||' can''t meet up tonight' end end,
  jsonb_build_object('invite_id',i.id,'thread_id',i.thread_id,'venue_id',i.venue_id),'invite-reply:'||i.id)
 on conflict do nothing;
 return i;
end $$;

-- Undo from "Invites Sent!" / "Meet Up Request": the sender's own pending
-- invites only. The delete trigger removes the card and notifications too.
create function public.withdraw_invites(p_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501';end if;
 delete from public.invites where id=any(coalesce(p_ids,'{}')) and sender_id=auth.uid() and status='pending';
 get diagnostics n=row_count;
 return n;
end $$;

-- Clear tonight's meet up with someone, from either side and in any state
-- (the friend card's "Cancel it"); also clears an older build's request.
create function public.cancel_meetup(p_other uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); n integer; m integer;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 delete from public.invites i where i.kind='meetup' and i.expires_at>now()
  and ((i.sender_id=me and i.receiver_id=p_other) or (i.sender_id=p_other and i.receiver_id=me));
 get diagnostics n=row_count;
 delete from public.notifications x using public.profiles p where p.id=me
  and x.type in('meetup_request','meetup_accepted') and not (x.data ? 'invite_id')
  and ((x.sender_id=me and x.receiver_id=p_other) or (x.sender_id=p_other and x.receiver_id=me))
  and x.created_at>=public.night_start_at(p.city,now());
 get diagnostics m=row_count;
 return n+m;
end $$;

-- Whatever removes an invite removes its card and its notifications.
create function spotted_private.invite_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.dm_messages where id=old.message_id;
 delete from public.notifications where data->>'invite_id'=old.id::text;
 return old;
end $$;
create trigger invite_cleanup after delete on public.invites for each row execute function spotted_private.invite_deleted();

-- The invite's own notification already pushes; a 'dm' alert for the pointer
-- would be a second push reading "Jane: [invite:…]".
create or replace function spotted_private.notify_dm() returns trigger language plpgsql security definer set search_path = '' as $$
declare name text;
begin
 if new.text ~ '^\[(invite|meetup):[0-9a-f-]{36}\]$' then return new; end if;
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

-- Invite notifications that carry an invite_id are readable while the invite
-- exists and still says what the notification says (a request stays, showing
-- its answer). Older rows without one keep their earlier rules. Everything
-- else is unchanged from 20260924213834_v1_plans_inbox_privacy.
create or replace function spotted_private.notification_source_visible(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
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
 select * into s from public.night_statuses where user_id=n.sender_id;
 return s.id is not null and s.expires_at>now() and s.expires_at=(n.data->>'night_expiry')::timestamptz
 and spotted_private.location_audience(n.receiver_id,n.sender_id,case when n.type='friend_planning'
 then coalesce(s.planning_visibility,(select location_sharing_level from public.profiles where id=s.user_id),'all_friends')
 else (select location_sharing_level from public.profiles where id=s.user_id) end)
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
end $$;

-- Push only a request that is still waiting: one answered (on the card or in
-- Activity) before the worker reached it stays readable but is not pushed.
create or replace function spotted_private.notification_allowed(n public.notifications) returns boolean
language sql stable set search_path='' as $$
 select coalesce(spotted_private.notification_source_visible(n),false) and spotted_private.notification_delivery_v1(n)
 and (n.type not in('venue_invite','meetup_request') or not (n.data ? 'invite_id')
  or exists(select 1 from public.invites i where i.id::text=n.data->>'invite_id' and i.status='pending'))
$$;

-- Live definition plus one line: invites go with their night. (The message
-- delete above already cascades them; this catches any row that outlives it.)
create or replace function public.nightly_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
  update profiles p
     set is_out = false,
         last_known_lat = null,
         last_known_lng = null,
         last_location_at = null
   where p.is_out = true
     and (
       not exists (
         select 1 from night_statuses s
          where s.user_id = p.id and s.status = 'out' and s.expires_at > v_now
       )
       or p.last_location_at < night_start_at(p.city, v_now)
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_locations', n);

  update checkins c
     set ended_at = v_now
   where c.ended_at is null
     and not exists (
       select 1 from night_statuses s
        where s.user_id = c.user_id and s.status = 'out' and s.expires_at > v_now
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ended_checkins', n);

  delete from dm_messages m
   where m.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = m.sender_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_dms', n);

  delete from invites where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_invites', n);

  update night_statuses
     set status = 'home',
         venue_name = null,
         venue_id = null,
         lat = null,
         lng = null,
         expires_at = null,
         is_private_party = false,
         party_neighborhood = null,
         party_address = null,
         planning_neighborhood = null,
         planning_venue_id = null,
         planning_venue_name = null,
         planning_visibility = null
   where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_statuses', n);

  -- Belt and braces: the trigger above already drops a party spot when its
  -- status resets, but an orphaned row must never outlive its night.
  delete from party_locations where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_party_locations', n);

  delete from posts where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_posts', n);

  delete from yap_messages where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_yaps', n);

  delete from plans where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_plans', n);

  delete from notifications x
   where x.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = x.receiver_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_notifications', n);

  raise notice '[nightly_reset] %', result;
  return result;
end;
$$;

revoke all on function public.nightly_reset() from public,anon,authenticated;
revoke all on function public.can_read_invite(uuid),public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid),
 public.respond_to_invite(uuid,boolean),public.withdraw_invites(uuid[]),public.cancel_meetup(uuid) from public,anon;
grant execute on function public.can_read_invite(uuid),public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid),
 public.respond_to_invite(uuid,boolean),public.withdraw_invites(uuid[]),public.cancel_meetup(uuid) to authenticated;
revoke all on function public.guard_dm_invite_pointer() from public,anon,authenticated;
revoke all on all functions in schema spotted_private from public,anon,authenticated;
commit;
