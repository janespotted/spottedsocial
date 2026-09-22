-- Run AFTER the migration. This file rolls back its synthetic users and
-- venues. RPC calls run as authenticated, with RLS.
begin;
create temporary table location_test_fixture as
select gen_random_uuid() as uid, gen_random_uuid() as other_uid,
       gen_random_uuid() as bar_a, gen_random_uuid() as bar_b,
       gen_random_uuid() as bar_c, gen_random_uuid() as restaurant;
grant select on location_test_fixture to authenticated;
insert into auth.users(id) select uid from location_test_fixture union all select other_uid from location_test_fixture;
insert into public.profiles(id,display_name,city,is_out,last_known_lat,last_known_lng,last_location_at)
select uid,'Location regression fixture','nyc',true,0,0,now()-interval '3 minutes' from location_test_fixture;
insert into public.profiles(id,display_name,city)
select other_uid,'Other regression fixture','nyc' from location_test_fixture;
insert into public.venues(id,name,neighborhood,type,city,lat,lng,is_demo)
select bar_a,'Regression Bar A','Test','bar','nyc',0,0,false from location_test_fixture union all
select bar_b,'Regression Bar B','Test','bar','nyc',0.003,0,false from location_test_fixture union all
select bar_c,'Regression Bar C','Test','nightclub','nyc',0.009,0,false from location_test_fixture union all
select restaurant,'Regression Restaurant','Test','restaurant','nyc',0.006,0,false from location_test_fixture;
insert into public.night_statuses(user_id,status,venue_id,venue_name,lat,lng,updated_at,expires_at,automatic_venue_updates)
select uid,'out',bar_a,'Regression Bar A',0,0,now()-interval '4 minutes',now()+interval '1 hour',true from location_test_fixture;
insert into public.checkins(user_id,venue_id,venue_name,lat,lng,started_at,last_updated_at)
select uid,bar_a,'Regression Bar A',0,0,now()-interval '4 minutes',now()-interval '3 minutes' from location_test_fixture;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from location_test_fixture),true);
select set_config('request.jwt.claims',json_build_object('sub',(select uid from location_test_fixture),'role','authenticated')::text,true);
do $$
declare f record; r jsonb; revision timestamptz := now()-interval '4 minutes'; n integer; stamp timestamptz;
begin
  select * into f from location_test_fixture;
  select last_location_at into stamp from public.profiles where id=f.uid;
  r := public.record_live_location(0.003,0,200,now()-interval '100 seconds',revision,0);
  assert r->>'status'='invalid','Poor GPS must be rejected';
  assert (select last_location_at=stamp from public.profiles where id=f.uid),'Rejected GPS refreshed timestamp';
  assert public.record_live_location(0.003,0,10,now()-interval '3 minutes',revision,0)->>'status'='invalid','Old GPS accepted';
  assert public.record_live_location(0.003,0,10,now()+interval '30 seconds',revision,0)->>'status'='invalid','Future GPS accepted';

  r := public.record_live_location(0.003,0,10,now()-interval '100 seconds',revision,0);
  assert r->>'status'='accepted' and (r->>'needs_sample')::boolean,'Arrival did not request follow-up samples';
  assert (select venue_id=f.bar_a from public.night_statuses where user_id=f.uid),'One fix switched venue';
  r := public.record_live_location(0.003,0,10,now()-interval '60 seconds',revision,0);
  assert (r->>'departed')::boolean,'Departure did not close prior bar';
  assert (select count(*)=0 from public.checkins where user_id=f.uid and ended_at is null),'Old check-in stayed open in transit';
  r := public.record_live_location(0.003,0,10,now()-interval '20 seconds',revision,0);
  assert (r->>'venue_changed')::boolean and r->>'venue_name'='Regression Bar B','Dwell did not switch A to B';
  assert (select count(*)=1 from public.checkins where user_id=f.uid and ended_at is null and venue_id=f.bar_b),'New bar check-in missing or duplicated';
  assert (select last_known_lat=0.003 and last_location_at=now()-interval '20 seconds' from public.profiles where id=f.uid),'Pin/time disagrees with accepted GPS';
  assert public.record_live_location(0.003,0,10,now()-interval '20 seconds',revision,0)->>'status'='ignored','Duplicate fix accepted';
  assert public.record_live_location(0.003,0,10,now()-interval '21 seconds',revision,0)->>'status'='ignored','Out-of-order fix accepted';
  assert public.record_live_location(0.003,0,10,now()-interval '10 seconds',revision-interval '1 second',0)->>'status'='conflict','Old session overwrote a newer check-in';
  assert public.record_live_location(40,-74,10,now()-interval '10 seconds',revision,0)->>'status'='invalid','Impossible jump accepted';

  -- Stop sharing and party modes cannot be resurrected by delayed GPS.
  update public.night_statuses set status='off',updated_at=now() where user_id=f.uid;
  assert public.record_live_location(0.003,0,10,now(),revision,0)->>'status'='stopped','Stop sharing bypassed';
  assert (select count(*)=0 from public.live_location_state where user_id=f.uid),'Stop did not purge candidate state';
  update public.night_statuses set status='out',is_private_party=true,updated_at=revision where user_id=f.uid;
  assert public.record_live_location(0.003,0,10,now(),revision,0)->>'status'='stopped','Private-party GPS leaked';
  update public.night_statuses set is_private_party=false,expires_at=now()-interval '1 second' where user_id=f.uid;
  assert public.record_live_location(0.003,0,10,now(),revision,0)->>'status'='stopped','Expired night accepted GPS';

  -- RLS is exercised as the real API role, not as postgres/service_role.
  begin
    insert into public.live_location_state(user_id,status_revision,expires_at)
      values(f.other_uid,revision,now()+interval '1 hour');
    raise exception 'Cross-user location state write succeeded';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*)=0 from public.profiles where id=f.other_uid),'Other raw profile readable';

  -- No automatic venue entry without opt-in; walking past a restaurant is
  -- never converted into a bar check-in even after dwelling there.
  update public.night_statuses set status='out',is_private_party=false,venue_id=null,venue_name=null,
    lat=0,lng=0,expires_at=now()+interval '1 hour',updated_at=revision,automatic_venue_updates=false where user_id=f.uid;
  update public.profiles set last_known_lat=0.003,last_known_lng=0,last_location_at=now()-interval '3 minutes' where id=f.uid;
  delete from public.live_location_state where user_id=f.uid;
  perform public.record_live_location(0.003,0,10,now()-interval '100 seconds',revision,0);
  perform public.record_live_location(0.003,0,10,now()-interval '60 seconds',revision,0);
  perform public.record_live_location(0.003,0,10,now()-interval '20 seconds',revision,0);
  assert (select venue_id is null from public.night_statuses where user_id=f.uid),'Auto arrival ignored opt-in';

  update public.night_statuses set automatic_venue_updates=true where user_id=f.uid;
  update public.profiles set last_known_lat=0.006,last_known_lng=0,last_location_at=now()-interval '3 minutes' where id=f.uid;
  delete from public.live_location_state where user_id=f.uid;
  perform public.record_live_location(0.006,0,10,now()-interval '100 seconds',revision,0);
  perform public.record_live_location(0.006,0,10,now()-interval '60 seconds',revision,0);
  perform public.record_live_location(0.006,0,10,now()-interval '20 seconds',revision,0);
  assert (select venue_id is null from public.night_statuses where user_id=f.uid),'Restaurant automatically selected';

  -- Driving past a bar is not an arrival.
  update public.profiles set last_known_lat=0.009,last_known_lng=0,last_location_at=now()-interval '3 minutes' where id=f.uid;
  delete from public.live_location_state where user_id=f.uid;
  perform public.record_live_location(0.009,0,10,now()-interval '100 seconds',revision,15);
  perform public.record_live_location(0.009,0,10,now()-interval '60 seconds',revision,15);
  perform public.record_live_location(0.009,0,10,now()-interval '20 seconds',revision,15);
  assert (select venue_id is null from public.night_statuses where user_id=f.uid),'Driving selected venue';

  -- A real next stop switches to the next club, with exactly one open row.
  update public.profiles set last_location_at=now()-interval '3 minutes' where id=f.uid;
  delete from public.live_location_state where user_id=f.uid;
  perform public.record_live_location(0.009,0,10,now()-interval '100 seconds',revision,0);
  perform public.record_live_location(0.009,0,10,now()-interval '60 seconds',revision,0);
  r := public.record_live_location(0.009,0,10,now()-interval '20 seconds',revision,0);
  assert (r->>'venue_changed')::boolean and r->>'venue_name'='Regression Bar C','Second venue transition failed';
  assert (select count(*)=1 from public.checkins where user_id=f.uid and ended_at is null),'Multiple open check-ins';

  -- Missing auth cannot use the authenticated-only function as someone else.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.record_live_location(0.009,0,10,now(),revision,0);
    raise exception 'Anonymous update succeeded';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;

-- A second bar ~20m from B makes the GPS result ambiguous.
update public.venues set lat=0.00318,lng=0 where id=(select bar_c from location_test_fixture);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from location_test_fixture),true);
select set_config('request.jwt.claims',json_build_object('sub',(select uid from location_test_fixture),'role','authenticated')::text,true);
do $$
declare f record; revision timestamptz := now()-interval '3 minutes';
begin
  select * into f from location_test_fixture;
  update public.night_statuses set venue_id=f.bar_a,venue_name='Regression Bar A',lat=0,lng=0,
    updated_at=revision,automatic_venue_updates=true where user_id=f.uid;
  update public.profiles set last_known_lat=0.003,last_known_lng=0,last_location_at=now()-interval '2 minutes' where id=f.uid;
  perform public.record_live_location(0.003,0,15,now()-interval '100 seconds',revision,0);
  perform public.record_live_location(0.003,0,15,now()-interval '60 seconds',revision,0);
  perform public.record_live_location(0.003,0,15,now()-interval '20 seconds',revision,0);
  assert (select venue_id is null from public.night_statuses where user_id=f.uid),'Ambiguous neighboring bars were guessed';
end; $$;
reset role;
update public.venues set lat=0.009 where id=(select bar_c from location_test_fixture);
set local role authenticated;
do $$
declare f record; revision timestamptz := now()-interval '3 minutes';
begin
  select * into f from location_test_fixture;
  delete from public.live_location_state where user_id=f.uid;
  update public.profiles set last_known_lat=0.003,last_known_lng=0,last_location_at=now()-interval '2 minutes' where id=f.uid;
  perform public.record_live_location(0.003,0,10,now()-interval '115 seconds',revision,0);
  perform public.record_live_location(0.003,0,10,now()-interval '50 seconds',revision,0);
  perform public.record_live_location(0.003,0,10,now()-interval '10 seconds',revision,0);
  assert (select venue_id is null from public.night_statuses where user_id=f.uid),'Dwell accumulated across an observation gap';
  update public.night_statuses set updated_at=now()-interval '5 seconds',venue_id=f.bar_a,venue_name='Manual correction' where user_id=f.uid;
  assert public.record_live_location(0.003,0,10,now(),revision,0)->>'status'='conflict','Delayed upload overwrote manual correction';
  assert (select venue_name='Manual correction' from public.night_statuses where user_id=f.uid),'Manual correction lost';
end; $$;
reset role;
rollback;
