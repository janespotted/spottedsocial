-- Explicit manual state changes and all their dependent writes commit together.
alter table public.night_statuses add column manual_venue_until timestamptz;
-- Fail safely for developer review; preserve historical rows instead of guessing a close time.
do $$ begin
 if exists(select 1 from public.checkins where ended_at is null group by user_id having count(*)>1)
 then raise exception 'Review and close duplicate open checkins before applying v1_product_atomic_location';end if;
end $$;
create unique index v1_one_open_checkin on public.checkins(user_id) where ended_at is null;

create function public.commit_night_status(p_patch jsonb,p_fix jsonb default null,p_audience text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); city text; tz text; state public.night_statuses; revision timestamptz;
 lat double precision;lng double precision;accuracy double precision;recorded timestamptz;gps boolean:=false;
begin
 if me is null or p_patch->>'user_id' is distinct from me::text then raise exception 'Invalid status owner' using errcode='42501';end if;
 if coalesce(p_patch->>'status','') not in ('out','planning','home','off') then raise exception 'Invalid status';end if;
 if p_audience is not null and p_audience not in ('close_friends','all_friends','mutual_friends') then raise exception 'Invalid audience';end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,43));
 -- Same lock order as live GPS: status first, then profile (including transition triggers).
 perform 1 from public.night_statuses where user_id=me for update;
 select p.city into city from public.profiles p where id=me for update;
 if not found then raise exception 'Profile unavailable';end if;
 revision:=clock_timestamp();
 tz:=case city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end;
 if p_fix is not null then
  lat:=(p_fix->>'lat')::double precision;lng:=(p_fix->>'lng')::double precision;
  accuracy:=(p_fix->>'accuracy')::double precision;recorded:=(p_fix->>'recordedAt')::timestamptz;
  gps:=coalesce(lat between -90 and 90 and lng between -180 and 180 and accuracy between 0 and 65
    and recorded>=now()-interval '2 minutes' and recorded<=now()+interval '15 seconds',false);
 end if;
 gps:=gps and p_patch->>'status'='out';
 if p_audience is not null then update public.profiles set location_sharing_level=p_audience where id=me;end if;
 -- Server owns the revision, expiry and validated coordinates. Never substitute venue coordinates.
 perform public.upsert_own_night_status(p_patch || jsonb_build_object('updated_at',revision,
   'expires_at',((public.night_start_at(city,now()) at time zone tz)+interval '1 day') at time zone tz,'lat',case when gps then lat end,'lng',case when gps then lng end));
 select * into state from public.night_statuses where user_id=me;
 update public.checkins set ended_at=revision where user_id=me and ended_at is null;
 if state.status='out' and not coalesce(state.is_private_party,false) and gps then
  insert into public.checkins(user_id,venue_id,venue_name,lat,lng,started_at,last_updated_at)
    values(me,state.venue_id,state.venue_name,lat,lng,revision,recorded);
 end if;
 update public.profiles set is_out=(state.status='out'),
   last_known_lat=case when state.status='out' and not coalesce(state.is_private_party,false) and gps then lat end,
   last_known_lng=case when state.status='out' and not coalesce(state.is_private_party,false) and gps then lng end,
   last_location_at=case when state.status='out' and not coalesce(state.is_private_party,false) and gps then recorded end
 where id=me;
 update public.night_statuses set manual_venue_until=case when state.status='out' and not coalesce(state.is_private_party,false)
  then least(state.expires_at,revision+interval '30 minutes') end where user_id=me;
 return jsonb_build_object('gps_shared',gps and state.status='out' and not coalesce(state.is_private_party,false),'revision',revision);
end $$;
revoke all on function public.commit_night_status(jsonb,jsonb,text) from public,anon;
grant execute on function public.commit_night_status(jsonb,jsonb,text) to authenticated;

-- Preserve capture-time, status-revision, expiry, accuracy and real departure checks.
-- A manual correction suppresses automatic reassignment, not genuine departure or GPS.
create or replace function public.record_live_location(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_recorded_at timestamptz,
  p_status_updated_at timestamptz,
  p_speed double precision default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.night_statuses%rowtype;
  st public.live_location_state%rowtype;
  profile public.profiles%rowtype;
  nearest record;
  second_distance double precision;
  current_distance double precision;
  elapsed double precision;
  changed boolean := false;
  needs_sample boolean := false;
  departed boolean := false;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_lat is null or not (p_lat between -90 and 90)
     or p_lng is null or not (p_lng between -180 and 180)
     or p_accuracy is null or not (p_accuracy between 0 and 65)
     or p_recorded_at is null or p_recorded_at < now()-interval '2 minutes'
     or p_recorded_at > now()+interval '15 seconds' then
    return jsonb_build_object('status','invalid');
  end if;

  -- Serialize with status edits: permission, expiry and revision are checked
  -- INSIDE the same transaction as the profile and check-in writes.
  select * into s from public.night_statuses where user_id=uid for update;
  if not found or s.status <> 'out' or coalesce(s.is_private_party,false)
     or s.expires_at is null or s.expires_at <= now() then
    return jsonb_build_object('status','stopped');
  end if;
  if p_status_updated_at is null or s.updated_at is distinct from p_status_updated_at
     or p_recorded_at < s.updated_at then
    return jsonb_build_object('status','conflict');
  end if;

  select * into profile from public.profiles where id=uid for update;
  if not found then return jsonb_build_object('status','stopped'); end if;
  if profile.last_location_at is not null and p_recorded_at <= profile.last_location_at then
    return jsonb_build_object('status','ignored');
  end if;
  elapsed := extract(epoch from p_recorded_at-profile.last_location_at);
  if elapsed > 0 and elapsed < 120 and profile.last_known_lat is not null
     and profile.last_known_lng is not null
     and public.live_distance_m(profile.last_known_lat,profile.last_known_lng,p_lat,p_lng) > greatest(200,elapsed*90) then
    return jsonb_build_object('status','invalid'); -- impossible short-interval jump
  end if;

  insert into public.live_location_state(user_id,status_revision,expires_at)
    values(uid,s.updated_at,s.expires_at) on conflict(user_id) do nothing;
  select * into st from public.live_location_state where user_id=uid for update;
  if st.status_revision is distinct from s.updated_at then
    st.candidate_id := null; st.candidate_since := null; st.candidate_last_at := null;
    st.candidate_samples := 0; st.departure_since := null; st.last_recorded_at := null;
  end if;

  -- Every timestamp means an actual accepted sample, never "app is alive".
  update public.profiles set last_known_lat=p_lat,last_known_lng=p_lng,
    last_location_at=p_recorded_at,is_out=true where id=uid;

  if s.venue_id is not null then
    select public.live_distance_m(p_lat,p_lng,v.lat,v.lng) into current_distance
      from public.venues v where v.id=s.venue_id;
  elsif s.lat is not null and s.lng is not null then
    current_distance := public.live_distance_m(p_lat,p_lng,s.lat,s.lng);
  end if;

  -- Only a good, physically nearby fix refreshes the active venue's presence.
  if current_distance <= 120 and p_accuracy <= 35 then
    update public.checkins set last_updated_at=p_recorded_at
      where user_id=uid and ended_at is null and venue_id is not distinct from s.venue_id;
  end if;

  if p_accuracy <= 35 then
    -- Departure is separate from arrival: someone in transit must stop being
    -- counted at the old bar even if their next destination isn't in our list.
    if (s.venue_id is not null or nullif(s.venue_name,'') is not null) and current_distance > 150+p_accuracy then
      if st.departure_since is null or st.last_recorded_at < p_recorded_at-interval '90 seconds' then
        st.departure_since := p_recorded_at;
      elsif p_recorded_at-st.departure_since >= interval '30 seconds' then
        update public.checkins set ended_at=p_recorded_at where user_id=uid and ended_at is null;
        update public.night_statuses set venue_id=null,venue_name=null,lat=p_lat,lng=p_lng where user_id=uid;
        s.venue_id := null; s.venue_name := null;
        departed := true; st.departure_since := null;
      end if;
      needs_sample := not departed;
    else
      st.departure_since := null;
    end if;

    -- Never automatically place people in restaurants, stadiums or a passing
    -- car. Ambiguous neighboring venues keep the last confirmed venue (or Out).
    if s.automatic_venue_updates and (s.manual_venue_until is null or s.manual_venue_until<=now())
       and coalesce(p_speed,0) <= 2.5 then
      select v.id,v.name,public.live_distance_m(p_lat,p_lng,v.lat,v.lng) as distance
        into nearest from public.venues v
        where v.is_demo=false and v.city=profile.city
          and v.type in ('bar','cocktail_bar','club','nightclub','lounge','rooftop','members_club')
          and abs(v.lat-p_lat) < 0.003 and abs(v.lng-p_lng) < 0.005
        order by public.live_distance_m(p_lat,p_lng,v.lat,v.lng),v.id limit 1;
      if found then
        select min(public.live_distance_m(p_lat,p_lng,v.lat,v.lng)) into second_distance
          from public.venues v where v.id<>nearest.id and v.is_demo=false and v.city=profile.city
            and v.type in ('bar','cocktail_bar','club','nightclub','lounge','rooftop','members_club')
            and abs(v.lat-p_lat) < 0.003 and abs(v.lng-p_lng) < 0.005;
        if nearest.id is distinct from s.venue_id and nearest.distance <= 80
           and (second_distance is null or second_distance-nearest.distance >= greatest(25,p_accuracy))
           and (s.venue_id is null or current_distance > greatest(60,2*p_accuracy)) then
          if st.candidate_id is distinct from nearest.id or st.candidate_last_at is null
             or p_recorded_at-st.candidate_last_at > interval '60 seconds' then
            st.candidate_id := nearest.id; st.candidate_since := p_recorded_at;
            st.candidate_samples := 1;
          elsif p_recorded_at-st.candidate_last_at >= interval '10 seconds' then
            st.candidate_samples := st.candidate_samples+1;
          end if;
          st.candidate_last_at := p_recorded_at;
          needs_sample := true;
          if st.candidate_samples >= 3 and p_recorded_at-st.candidate_since >= interval '75 seconds' then
            update public.checkins set ended_at=p_recorded_at where user_id=uid and ended_at is null;
            insert into public.checkins(user_id,venue_id,venue_name,lat,lng,started_at,last_updated_at)
              values(uid,nearest.id,nearest.name,p_lat,p_lng,p_recorded_at,p_recorded_at);
            update public.night_statuses set venue_id=nearest.id,venue_name=nearest.name,
              lat=p_lat,lng=p_lng where user_id=uid;
            s.venue_id := nearest.id; s.venue_name := nearest.name;
            changed := true; needs_sample := false;
            st.candidate_id := null; st.candidate_since := null;
            st.candidate_last_at := null; st.candidate_samples := 0;
          end if;
        else
          st.candidate_id := null; st.candidate_since := null;
          st.candidate_last_at := null; st.candidate_samples := 0;
        end if;
      else
        st.candidate_id := null; st.candidate_since := null;
        st.candidate_last_at := null; st.candidate_samples := 0;
      end if;
    else
      st.candidate_id := null; st.candidate_since := null;
      st.candidate_last_at := null; st.candidate_samples := 0;
    end if;
  else
    st.candidate_id := null; st.candidate_since := null;
    st.candidate_last_at := null; st.candidate_samples := 0; st.departure_since := null;
  end if;

  update public.live_location_state set status_revision=s.updated_at,
    candidate_id=st.candidate_id,candidate_since=st.candidate_since,
    candidate_last_at=st.candidate_last_at,candidate_samples=st.candidate_samples,
    departure_since=st.departure_since,last_recorded_at=p_recorded_at,expires_at=s.expires_at
    where user_id=uid;
  return jsonb_build_object('status','accepted','venue_changed',changed,'departed',departed,
    'needs_sample',needs_sample,'venue_id',s.venue_id,'venue_name',s.venue_name);
end; $$;
revoke all on function public.record_live_location(double precision,double precision,double precision,timestamptz,timestamptz,double precision) from public, anon;
grant execute on function public.record_live_location(double precision,double precision,double precision,timestamptz,timestamptz,double precision) to authenticated;
