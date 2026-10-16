-- Add the third explicit audience using the existing relationship/block rules.
-- Existing two-ring plans keep their stored visibility; no data is broadened.
begin;
create or replace function spotted_private.plan_visible(viewer uuid,plan uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select viewer is not null and exists(select 1 from public.plans p where p.id=plan
 and (viewer=p.user_id or (p.expires_at>now() and spotted_private.audience_allows(viewer,p.user_id,
 case p.visibility when 'friends' then 'all_friends' when 'close_friends' then 'close_friends' when 'mutual_friends' then 'mutual_friends' else 'none' end))))
$$;

create or replace function public.guard_plan_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and tg_op='UPDATE' then
 if new.id<>old.id or new.user_id<>old.user_id or new.created_at is distinct from old.created_at then
 raise exception 'Plan ownership is immutable';end if;end if;
 if new.visibility is null or new.visibility not in ('friends','close_friends','mutual_friends') then raise exception 'Invalid plan audience';end if;
 if tg_op='INSERT' or (new.venue_id,new.venue_name,new.plan_date,new.plan_time,new.description,new.visibility,new.expires_at)
 is distinct from (old.venue_id,old.venue_name,old.plan_date,old.plan_time,old.description,old.visibility,old.expires_at)
 then new.privacy_revision:=clock_timestamp();else new.privacy_revision:=old.privacy_revision;end if;
 return new;
end $$;

create or replace function public.save_plan(p_id uuid,p_values jsonb,p_participants uuid[] default '{}') returns uuid
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
 if chosen_visibility is null or chosen_visibility not in ('friends','close_friends','mutual_friends') then raise exception 'Invalid plan audience';end if;
 if exists(select 1 from unnest(p_participants) u where u is null or u=me or not spotted_private.audience_allows(u,me,
 case chosen_visibility when 'friends' then 'all_friends' when 'mutual_friends' then 'mutual_friends' else 'close_friends' end)) then raise exception 'A selected friend cannot view this audience';end if;
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
commit;
