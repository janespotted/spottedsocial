-- Recheck visit-time grants on cached recaps, and consider neighboring venues
-- consistently even when an administrator overrides their home city.
begin;
CREATE OR REPLACE FUNCTION public.record_live_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_recorded_at timestamp with time zone, p_status_updated_at timestamp with time zone, p_speed double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- A manual venue correction is anchored to the user's real check-in fix.
  -- Catalogue coordinates can be approximate; they must not erase a correction.
  if (not s.automatic_venue_updates or s.manual_venue_until>now()) and s.lat is not null and s.lng is not null then
    current_distance := public.live_distance_m(p_lat,p_lng,s.lat,s.lng);
  elsif s.venue_id is not null then
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
    if s.automatic_venue_updates and (s.manual_venue_until is null or s.manual_venue_until<=now())
       and (s.venue_id is not null or nullif(s.venue_name,'') is not null) and current_distance > 150+p_accuracy then
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
        where v.is_demo=false 
          and v.type in ('bar','cocktail_bar','club','nightclub','lounge','rooftop','members_club')
          and abs(v.lat-p_lat) < 0.003 and abs(v.lng-p_lng) < 0.005
        order by public.live_distance_m(p_lat,p_lng,v.lat,v.lng),v.id limit 1;
      if found then
        select min(public.live_distance_m(p_lat,p_lng,v.lat,v.lng)) into second_distance
          from public.venues v where v.id<>nearest.id and v.is_demo=false
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
end; $function$;

CREATE OR REPLACE FUNCTION public.get_night_recap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); r public.night_recaps;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 select * into r from public.night_recaps where user_id=me and expires_at>now() order by night_date desc limit 1;
 if r.id is null then return null;end if;
 return jsonb_build_object(
  'id',r.id,'night_date',r.night_date,'expires_at',r.expires_at,
  'stops',coalesce((select jsonb_agg(jsonb_build_object('venue_id',s.venue_id,'venue_name',s.venue_name,
    'neighborhood',s.neighborhood,'arrived_at',s.arrived_at,'left_at',s.left_at) order by s.position)
   from public.night_recap_stops s where s.recap_id=r.id),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'storage_key',p.storage_key,
    'mux_playback_id',p.mux_playback_id,'kind',case when p.mux_playback_id is null then 'photo' else 'video' end,
    'width',p.width,'height',p.height,'thumbhash',p.thumbhash,'source',p.source) order by p.taken_at)
   from public.night_recap_photos p where p.recap_id=r.id and p.source='post'),'[]'::jsonb),
  -- Recheck current sharing permission; historic overlap is not perpetual consent.
  'people',coalesce((select jsonb_agg(jsonb_build_object('friend_id',x.friend_id,'display_name',pr.display_name,
    'avatar_url',pr.avatar_url,'venue_id',x.venue_id,'venue_name',x.venue_name) order by x.overlap_start)
   from public.night_recap_people x join public.profiles pr on pr.id=x.friend_id
   where x.recap_id=r.id and spotted_private.direct_friend(me,x.friend_id)
     and spotted_private.location_audience(me,x.friend_id,coalesce(pr.location_sharing_level,'all_friends'))
     and exists(select 1 from public.checkins ck
       join spotted_private.venue_visit_audience a on a.visit_id=ck.id and a.viewer_id=me
       join spotted_private.venue_visits v on v.id=a.visit_id and v.captured_at is not null and v.expires_at>now()
       where ck.user_id=x.friend_id and ck.venue_id=x.venue_id and ck.verified
         and ck.started_at<=x.overlap_start
         and coalesce(ck.ended_at,greatest(ck.last_updated_at,ck.started_at))>=x.overlap_end)),'[]'::jsonb));
end $function$;
commit;
