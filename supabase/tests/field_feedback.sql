begin;
create temporary table field_fixture as select gen_random_uuid() owner,gen_random_uuid() friend,gen_random_uuid() venue;
grant select on field_fixture to authenticated;
insert into auth.users(id) select owner from field_fixture union all select friend from field_fixture;
insert into public.profiles(id,display_name,city,location_sharing_level,is_out) select owner,'Field Host','nyc','all_friends',true from field_fixture union all select friend,'Field Friend','la','all_friends',true from field_fixture;
insert into spotted_private.launch_members(user_id,completed_at,grandfathered) select owner,now(),true from field_fixture union all select friend,now(),true from field_fixture;
insert into public.friendships(user_id,friend_id,status) select owner,friend,'accepted' from field_fixture;
insert into public.venues(id,name,neighborhood,city,lat,lng,type,is_demo) select venue,'Field venue offset','Test','la',0,0,'bar',false from field_fixture;
insert into public.night_statuses(user_id,status,venue_id,venue_name,lat,lng,updated_at,expires_at,automatic_venue_updates)
select owner,'out'::public.night_status_enum,venue,'Field venue offset',0.003,0,now()-interval '4 minutes',now()+interval '1 hour',false from field_fixture union all
select friend,'out'::public.night_status_enum,venue,'Field venue offset',0.003,0,now()-interval '4 minutes',now()+interval '1 hour',false from field_fixture;
insert into public.checkins(user_id,venue_id,venue_name,lat,lng,started_at,last_updated_at)
select owner,venue,'Field venue offset',0.003,0,now()-interval '3 minutes',now()-interval '2 minutes' from field_fixture union all
select friend,venue,'Field venue offset',0.003,0,now()-interval '2 minutes',now()-interval '10 seconds' from field_fixture;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner from field_fixture),'role','authenticated')::text,true);
do $$ declare f record;r jsonb;begin
 select * into f from field_fixture;
 r:=public.record_live_location(0.003,0,10,now()-interval '60 seconds',now()-interval '4 minutes',0);
 assert r->>'status'='accepted','manual GPS rejected';
 r:=public.record_live_location(0.003,0,10,now()-interval '20 seconds',now()-interval '4 minutes',0);
 assert not (r->>'departed')::boolean,'manual venue auto departed';
 assert r->>'venue_name'='Field venue offset','manual venue name erased';
 assert (select venue_id=f.venue from public.night_statuses where user_id=f.owner),'manual venue id erased';
 assert (select last_updated_at=now()-interval '20 seconds' from public.checkins where user_id=f.owner and ended_at is null),'manual anchor did not extend verified visit';
 assert (select last_known_lat=0.003 from public.profiles where id=f.owner),'catalogue coordinate replaced actual GPS';
end $$;
reset role;
select spotted_private.build_night_recap(owner,now()-interval '10 minutes',now(),current_date,true) from field_fixture;
do $$ declare f record;begin select * into f from field_fixture;
 assert (select count(*)=1 from public.night_recap_people p join public.night_recaps r on r.id=p.recap_id where r.user_id=f.owner and p.friend_id=f.friend),'different city modes lost same venue overlap';
 assert exists(select 1 from spotted_private.venue_visit_audience a join public.checkins c on c.id=a.visit_id where c.user_id=f.friend and a.viewer_id=f.owner),'visit-time grant missing';
end $$;
insert into public.night_recap_photos(recap_id,user_id,storage_key,source) select r.id,r.user_id,r.user_id||'/field-post.jpg','post' from public.night_recaps r join field_fixture f on f.owner=r.user_id union all select r.id,r.user_id,r.user_id||'/recap-v1/field-library.jpg','library' from public.night_recaps r join field_fixture f on f.owner=r.user_id;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.get_night_recap();
 assert jsonb_array_length(r->'photos')=1,'recap included personal library media';
 assert r->'photos'->0->>'source'='post','recap post was removed';
 assert jsonb_array_length(r->'people')=1,'authorized crossed path missing';
 begin perform public.add_recap_photo((r->>'id')::uuid,'anything');raise exception 'library-only add allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.night_recap_people;raise exception 'raw recap audience readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.location_hidden(user_id,hidden_from_id) select friend,owner from field_fixture;
set local role authenticated;
do $$ begin assert jsonb_array_length(public.get_night_recap()->'people')=0,'hidden friend remained in recap';end $$;
reset role;
delete from public.location_hidden h using field_fixture f where h.user_id=f.friend and h.hidden_from_id=f.owner;
-- Current consent alone cannot manufacture a historical audience.
delete from spotted_private.venue_visit_audience a using public.checkins c,field_fixture f where a.visit_id=c.id and c.user_id=f.friend and a.viewer_id=f.owner;
set local role authenticated;
do $$ begin assert jsonb_array_length(public.get_night_recap()->'people')=0,'cached recap inferred historical consent';end $$;
reset role;
select spotted_private.build_night_recap(owner,now()-interval '10 minutes',now(),current_date,true) from field_fixture;
set local role authenticated;
do $$ begin assert jsonb_array_length(public.get_night_recap()->'people')=0,'historical consent was inferred';end $$;
reset role;
-- A manual correction also survives the temporary hold with automatic updates on.
update public.night_statuses set automatic_venue_updates=true,manual_venue_until=now()+interval '30 minutes' where user_id=(select owner from field_fixture);
update public.profiles set last_location_at=now()-interval '2 minutes' where id=(select owner from field_fixture);
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.record_live_location(0.003,0,10,now()-interval '60 seconds',now()-interval '4 minutes',0);
 r:=public.record_live_location(0.003,0,10,now()-interval '10 seconds',now()-interval '4 minutes',0);
 assert not (r->>'departed')::boolean,'manual correction hold ignored';
 assert r->>'venue_name'='Field venue offset','correction name disappeared';
end $$;
reset role;
select jsonb_build_object('passed',18,'failed',0,'method','real database, authenticated callers, rollback fixtures') result;
rollback;
