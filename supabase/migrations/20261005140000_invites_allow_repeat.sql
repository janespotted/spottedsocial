-- Client (Oct 5 2026): people can send as many Meet Ups and venue invites as
-- they like; the app must not block a repeat. Each send is its own card with
-- its own Accept / Decline. The once-per-night rule from 20261005120000 goes;
-- the only guard left is against a double tap (the same request to the same
-- person within 30 seconds returns the card just made instead of a second one).
begin;

drop index if exists public.invites_venue_once;
drop index if exists public.invites_meetup_once;
create index invites_pair_recent on public.invites(sender_id,receiver_id,kind,created_at desc);

create or replace function public.send_venue_invites(p_venue_id uuid,p_receivers uuid[])
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
  -- Double tap only: the same venue to the same friend seconds ago
  select * into existing from public.invites i where i.kind='venue' and i.sender_id=me and i.receiver_id=r
   and i.venue_id=v.id and i.status='pending' and i.created_at>now()-interval '30 seconds'
   order by i.created_at desc limit 1;
  if existing.id is not null then
   invite_id:=existing.id;receiver_id:=r;thread_id:=existing.thread_id;created:=false;return next;continue;
  end if;
  made:=spotted_private.post_invite('venue',me,r,v.id,v.name,expiry);
  invite_id:=made.id;receiver_id:=r;thread_id:=made.thread_id;created:=true;return next;
 end loop;
end $$;

-- Always 'sent' now; the result column stays so older callers keep parsing.
create or replace function public.send_meetup(p_receiver uuid)
returns table(result text,invite_id uuid,thread_id uuid)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid(); existing public.invites; made public.invites; s public.night_statuses;
 v_venue_id uuid; v_venue_name text; expiry timestamptz;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if p_receiver is null or p_receiver=me or not spotted_private.invite_allowed('meetup',me,p_receiver) then
  raise exception 'This person is no longer available for this request.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_receiver::text,44));
 -- Double tap only: a request to them seconds ago is this request
 select * into existing from public.invites i where i.kind='meetup' and i.sender_id=me and i.receiver_id=p_receiver
  and i.status='pending' and i.created_at>now()-interval '30 seconds' order by i.created_at desc limit 1;
 if existing.id is not null then
  result:='sent';invite_id:=existing.id;thread_id:=existing.thread_id;return next;return;
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

-- Only existed to escape the once-per-night rule; Undo (withdraw_invites)
-- still takes back an unanswered request.
drop function if exists public.cancel_meetup(uuid);

revoke all on function public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid) from public,anon;
grant execute on function public.send_venue_invites(uuid,uuid[]),public.send_meetup(uuid) to authenticated;
commit;
