begin;
alter table public.plans add column privacy_revision timestamptz not null default now();
create function spotted_private.plan_visible(viewer uuid,plan uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select viewer is not null and exists(select 1 from public.plans p where p.id=plan
 and (viewer=p.user_id or (p.expires_at>now() and spotted_private.audience_allows(viewer,p.user_id,
 case p.visibility when 'friends' then 'all_friends' when 'close_friends' then 'close_friends' else 'none' end))))
$$;
create function public.can_read_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select spotted_private.plan_visible(auth.uid(),p_plan)
$$;
create function public.can_tag_plan(p_plan uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.plans p where p.id=p_plan and p.user_id=auth.uid()
 and p.expires_at>now() and p_user<>p.user_id and spotted_private.plan_visible(p_user,p_plan))
$$;
-- Replace, rather than OR new rules with old permissive policies.
do $$ declare p record; t text;begin
 for p in select tablename,policyname from pg_policies where schemaname='public'
 and tablename in ('plans','plan_comments','plan_downs','plan_votes','plan_participants')
 loop execute format('drop policy %I on public.%I',p.policyname,p.tablename);end loop;
 for t in select unnest(array['plan_comments','plan_downs','plan_votes']) loop
 execute format('create policy v1_read on public.%I for select to authenticated using(public.can_read_plan(plan_id))',t);
 execute format('create policy v1_insert on public.%I for insert to authenticated with check(user_id=auth.uid() and public.can_read_plan(plan_id) and exists(select 1 from public.plans where id=plan_id and expires_at>now()))',t);
 execute format('create policy v1_update on public.%I for update to authenticated using(user_id=auth.uid() and public.can_read_plan(plan_id)) with check(user_id=auth.uid() and public.can_read_plan(plan_id) and exists(select 1 from public.plans where id=plan_id and expires_at>now()))',t);
 execute format('create policy v1_delete on public.%I for delete to authenticated using(user_id=auth.uid() and public.can_read_plan(plan_id))',t);
 end loop;
end $$;
create policy v1_plan_read on public.plans for select to authenticated using(public.can_read_plan(id));
create policy v1_plan_insert on public.plans for insert to authenticated with check(user_id=auth.uid());
create policy v1_plan_update on public.plans for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy v1_plan_delete on public.plans for delete to authenticated using(user_id=auth.uid());
create policy v1_participant_read on public.plan_participants for select to authenticated using(public.can_read_plan(plan_id));
create policy v1_participant_insert on public.plan_participants for insert to authenticated with check(public.can_tag_plan(plan_id,user_id));
create policy v1_participant_delete on public.plan_participants for delete to authenticated
 using(exists(select 1 from public.plans where id=plan_id and user_id=auth.uid()));

-- NOT VALID preserves historical orphan rows for explicit operator review while
-- enforcing new writes and cascading future deletes. Orphans are unreadable.
alter table public.plan_downs add constraint v1_down_parent foreign key(plan_id) references public.plans(id) on delete cascade not valid;
alter table public.plan_votes add constraint v1_vote_parent foreign key(plan_id) references public.plans(id) on delete cascade not valid;
alter table public.plan_participants add constraint v1_participant_parent foreign key(plan_id) references public.plans(id) on delete cascade not valid;
-- Duplicate old data is a review gate; never silently discard participation.
create unique index v1_plan_down_pair on public.plan_downs(plan_id,user_id);
create unique index v1_plan_vote_pair on public.plan_votes(plan_id,user_id);
create unique index v1_plan_participant_pair on public.plan_participants(plan_id,user_id);

create function public.guard_plan_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and tg_op='UPDATE' then
 if new.id<>old.id or new.user_id<>old.user_id or new.created_at is distinct from old.created_at then
 raise exception 'Plan ownership is immutable';end if;end if;
 if new.visibility not in ('friends','close_friends') then raise exception 'Invalid plan audience';end if;
 if tg_op='INSERT' or (new.venue_id,new.venue_name,new.plan_date,new.plan_time,new.description,new.visibility,new.expires_at)
 is distinct from (old.venue_id,old.venue_name,old.plan_date,old.plan_time,old.description,old.visibility,old.expires_at)
 then new.privacy_revision:=clock_timestamp();else new.privacy_revision:=old.privacy_revision;end if;
 return new;
end $$;
create trigger v1_plan_guard before insert or update on public.plans for each row execute function public.guard_plan_identity();
create function public.guard_plan_child() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and (new.id<>old.id or new.user_id<>old.user_id or new.plan_id<>old.plan_id)
 then raise exception 'Plan interaction identity is immutable';end if;return new;
end $$;
create trigger v1_down_guard before update on public.plan_downs for each row execute function public.guard_plan_child();
create trigger v1_vote_guard before update on public.plan_votes for each row execute function public.guard_plan_child();
create trigger v1_comment_guard before update on public.plan_comments for each row execute function public.guard_plan_child();

-- Atomic native create/edit + participant validation. Existing direct table
-- paths are still protected by RLS, including old client builds.
create function public.save_plan(p_id uuid,p_values jsonb,p_participants uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();result uuid;city text;tz text;venue public.venues;plan_day date;expiry timestamptz;chosen_visibility text;
begin
 if me is null then raise exception 'Authentication required' using errcode='42501';end if;
 select p.city into city from public.profiles p where p.id=me;
 if not found then raise exception 'Account unavailable';end if;
 if jsonb_typeof(p_values)<>'object' or exists(select 1 from jsonb_object_keys(p_values) k where k not in
 ('venue_id','plan_date','plan_time','plan_type','description','visibility')) then raise exception 'Invalid plan fields';end if;
 if cardinality(coalesce(p_participants,'{}'))>100 then raise exception 'Too many participants';end if;
 select * into venue from public.venues where id=(p_values->>'venue_id')::uuid;
 if not found then raise exception 'Venue unavailable';end if;
 plan_day:=(p_values->>'plan_date')::date;chosen_visibility:=p_values->>'visibility';
 tz:=case city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end;
 expiry:=((plan_day+1)+time '05:00') at time zone tz;
 if expiry is null or expiry<=now() then raise exception 'Plan has expired';end if;
 if chosen_visibility is null or chosen_visibility not in ('friends','close_friends') then raise exception 'Invalid plan audience';end if;
 if exists(select 1 from unnest(p_participants) u where u is null or u=me or not spotted_private.audience_allows(u,me,
 case chosen_visibility when 'friends' then 'all_friends' else 'close_friends' end)) then raise exception 'A selected friend cannot view this audience';end if;
 if p_id is null then
 insert into public.plans(user_id,venue_id,venue_name,plan_date,plan_time,plan_type,description,visibility,expires_at)
 values(me,venue.id,venue.name,plan_day,(p_values->>'plan_time')::time,p_values->>'plan_type',nullif(p_values->>'description',''),chosen_visibility,expiry)
 returning id into result;
 else
 select id into result from public.plans where id=p_id and user_id=me for update;
 if not found then raise exception 'Plan unavailable' using errcode='42501';end if;
 update public.plans set venue_id=venue.id,venue_name=venue.name,plan_date=plan_day,plan_time=(p_values->>'plan_time')::time,
 plan_type=p_values->>'plan_type',description=nullif(p_values->>'description',''),visibility=chosen_visibility,expires_at=expiry where id=result;
 end if;
 delete from public.plan_participants where plan_id=result and not(user_id=any(coalesce(p_participants,'{}')));
 insert into public.plan_participants(plan_id,user_id) select result,u from unnest(p_participants) u on conflict do nothing;
 return result;
end $$;

create function spotted_private.notify_plan_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.plans;sender uuid;receiver uuid;kind text;name text;copy text;
begin
 select * into p from public.plans where id=new.plan_id;
 if p.id is null or p.expires_at<=now() or not spotted_private.plan_visible(new.user_id,p.id) then return new;end if;
 if tg_table_name='plan_participants' then sender:=p.user_id;receiver:=new.user_id;kind:='plan_invite';
 else sender:=new.user_id;receiver:=p.user_id;kind:='plan_down';end if;
 if sender=receiver or exists(select 1 from public.profiles where id in(sender,receiver) and is_demo is true) then return new;end if;
 select display_name into name from public.profiles where id=sender;
 copy:=case kind when 'plan_invite' then coalesce(name,'Someone')||' invited you to their plans at '||p.venue_name
 else split_part(coalesce(name,'Someone'),' ',1)||' is down for your plan at '||p.venue_name||'! 🎉' end;
 insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
 values(sender,receiver,kind,copy,jsonb_build_object('plan_id',p.id,'plan_revision',p.privacy_revision),
 kind||':'||p.id||':'||new.user_id||':'||p.privacy_revision) on conflict do nothing;
 return new;
end $$;
create trigger v1_plan_invite after insert on public.plan_participants for each row execute function spotted_private.notify_plan_interaction();
create trigger v1_plan_down after insert on public.plan_downs for each row execute function spotted_private.notify_plan_interaction();

-- An inbox privacy decision is independent of push opt-outs, recipient night
-- status, cooldowns and provider delivery. All callers use the same source rule.
create function spotted_private.notification_source_visible(n public.notifications) returns boolean
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
 if n.type in ('meetup_request','meetup_accepted') then
 return spotted_private.audience_allows(n.sender_id,n.receiver_id,'mutual_friends');end if;
 if n.type in ('friend_accepted','invite_accepted','venue_invite','venue_invite_accepted') then
 return spotted_private.direct_friend(n.sender_id,n.receiver_id);end if;
 if n.type in ('daily_nudge_first','daily_nudge_second','weekend_rally','morning_after') then return n.sender_id=n.receiver_id;end if;
 return false; -- Includes parked Yap and unrecognized/source-less types.
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end $$;
alter function spotted_private.notification_allowed(public.notifications) rename to notification_delivery_v1;
create function spotted_private.notification_allowed(n public.notifications) returns boolean
language sql stable set search_path='' as $$
 select coalesce(spotted_private.notification_source_visible(n),false) and spotted_private.notification_delivery_v1(n)
$$;
create function public.can_read_notification(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.notifications n where n.id=p_id
 and auth.uid() in(n.receiver_id,n.sender_id) and spotted_private.notification_source_visible(n))
$$;
create policy v1_notification_source on public.notifications as restrictive for select to authenticated
 using(public.can_read_notification(id));
-- A recipient may mark read, never rewrite a source, sender, receiver or payload.
revoke update on public.notifications from public,anon,authenticated;
grant update(is_read) on public.notifications to authenticated;

-- Source-owned plan alerts cannot be manufactured through either legacy RPC.
create or replace function public.create_notification(p_receiver_id uuid,p_type text,p_message text)
returns setof public.notifications language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Not authenticated';end if;
 if p_type not in ('meetup_request','meetup_accepted','venue_invite','venue_invite_accepted','invite_accepted') then return;end if;
 if p_type in ('meetup_request','meetup_accepted') then
 if not spotted_private.audience_allows(auth.uid(),p_receiver_id,'mutual_friends') then return;end if;
 elsif not spotted_private.direct_friend(auth.uid(),p_receiver_id) then return;end if;
 return query select * from public.create_notification_core(p_receiver_id,p_type,p_message);
end $$;
-- Old ambiguous rows are retained for operator inspection but fail closed.
-- Delete exact plan notifications with the source, never a whole night's invites.
create function spotted_private.delete_plan_notifications() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.notifications where data->>'plan_id'=old.id::text;return old;end $$;
create trigger v1_plan_notification_cleanup after delete on public.plans for each row execute function spotted_private.delete_plan_notifications();
revoke all on function spotted_private.plan_visible(uuid,uuid),spotted_private.notify_plan_interaction(),
 spotted_private.notification_source_visible(public.notifications),spotted_private.notification_delivery_v1(public.notifications),
 spotted_private.notification_allowed(public.notifications),spotted_private.delete_plan_notifications() from public,anon,authenticated;
revoke all on function public.guard_plan_identity(),public.guard_plan_child() from public,anon,authenticated;
revoke all on function public.can_read_plan(uuid),public.can_tag_plan(uuid,uuid),public.can_read_notification(uuid),public.save_plan(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.can_read_plan(uuid),public.can_tag_plan(uuid,uuid),public.can_read_notification(uuid),public.save_plan(uuid,jsonb,uuid[]) to authenticated;
commit;
