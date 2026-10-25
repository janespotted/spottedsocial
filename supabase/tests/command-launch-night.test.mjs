import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function testLaunchNight(db,{founder,member,demo,delegated}) {
 const q=async sql=>(await db.query(sql)).rows;
 await db.exec(`reset role;
 delete from public.friendships;delete from public.blocked_users;delete from spotted_private.usage_exclusions;
 alter table public.profiles add column location_sharing_level text default 'all_friends';
 alter table spotted_private.launch_guests add column name text;
 alter table spotted_private.push_settings add column singleton boolean default true;
 create table spotted_private.launch_settings(singleton boolean primary key,wave_gate boolean,require_phone boolean,install_url text,sms_enabled boolean);
 insert into spotted_private.launch_settings values(true,false,false,null,false);
 create table public.night_statuses(user_id uuid primary key,status text,venue_id uuid,expires_at timestamptz,updated_at timestamptz,is_demo boolean default false,is_private_party boolean default false,lat float,lng float,party_address text);
 create table public.venues(id uuid primary key,name text,neighborhood text,lat float,lng float,city text,type text,is_demo boolean default false,is_user_submitted boolean default false);
 create table public.location_hidden(user_id uuid,hidden_from_id uuid);
 create table public.close_friends(user_id uuid,close_friend_id uuid);
 update public.profiles set display_name=case id when '${founder}' then 'Founder' when '${member}' then 'Visible member' else 'Other' end;
 `);
 await db.exec(await readFile(new URL('./fixtures/command-night-privacy.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/20261024193915_command_center_launch_night.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${member}',false)`);
  for(const rpc of ['command_launch_night()','command_launch_roster()'])await assert.rejects(db.query(`select public.${rpc}`),/permission denied|Founder monitoring/);
  await db.exec('reset role');
 }
 const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
 await db.exec(`
 insert into public.venues values('${a}','Catalog venue','SoHo',40.72,-74,'nyc','bar',false,false),('${b}','Other venue','LES',40.73,-73.99,'nyc','club',false,false);
 insert into public.friendships values('${founder}','${member}','accepted'),('${member}','${founder}','accepted');
 insert into public.night_statuses(user_id,status,expires_at,updated_at) values('${founder}','planning',now()+interval '5 hours',now());
 insert into public.night_statuses(user_id,status,venue_id,expires_at,updated_at,lat,lng,party_address) values('${member}','out','${a}',now()+interval '5 hours',now(),41.12345,-73.12345,'NEVER PRIVATE HOME'),('${demo}','out','${a}',now()+interval '5 hours',now(),41.12345,-73.12345,null);
 set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);
 `);
 const snapshot=async(city='nyc')=>(await db.query('select public.command_launch_night($1) r',[city])).rows[0].r;
 let s=await snapshot();
 assert.equal(s.counts.out,1);assert.equal(s.counts.tbd,1);assert.equal(s.counts.mapped,1);
 assert.equal(s.venues[0].people,1);assert.equal(s.venues[0].members[0].name,'Visible member');
 for(const value of ['41.12345','-73.12345','NEVER PRIVATE HOME',demo])assert.ok(!JSON.stringify(s).includes(value),'No private GPS, address or demo identity');
 await assert.rejects(db.query("select public.command_launch_night('other')"),/Invalid city/);
 await db.exec(`reset role;update public.night_statuses set updated_at=now() where user_id='${member}';set role authenticated;`);
 assert.equal((await snapshot()).venues[0].people,1,'duplicate edits count once');
 await db.exec(`reset role;update public.night_statuses set venue_id='${b}' where user_id='${member}';set role authenticated;`);
 assert.equal((await snapshot()).venues[0].venue_id,b,'one current venue, old venue disappears');
 for(const mutate of [
  `insert into public.location_hidden values('${member}','${founder}')`,
  `insert into public.blocked_users values('${founder}','${member}')`,
  `update public.profiles set location_sharing_level='close_friends' where id='${member}'`,
  `update public.night_statuses set is_private_party=true where user_id='${member}'`,
  `update public.venues set is_user_submitted=true where id='${b}'`,
 ]) {
  await db.exec(`reset role;begin;${mutate};set role authenticated;`);
  const hidden=await snapshot();assert.equal(hidden.venues.length,0,'permission or nonpublic venue excludes map');assert.equal(hidden.counts.out,1,'aggregate status is independent of sharing');
  await db.exec('reset role;rollback;set role authenticated;');
 }
 await db.exec(`reset role;update public.night_statuses set status='home' where user_id='${founder}';set role authenticated;`);
 s=await snapshot();assert.equal(s.counts.in,1);assert.equal(s.venues.length,0,'founder participation rule preserved');
 await db.exec(`reset role;update public.night_statuses set status='planning' where user_id='${founder}';update public.night_statuses set status='off' where user_id='${member}';set role authenticated;`);
 s=await snapshot();assert.equal(s.counts.paused,1);assert.equal(s.counts.in,0);assert.equal(s.venues.length,0,'stop sharing is not IN and removes venue');
 await db.exec(`reset role;update public.night_statuses set status='out',expires_at=now()-interval '1 minute' where user_id='${member}';set role authenticated;`);
 s=await snapshot();assert.equal(s.counts.out,0);assert.equal(s.venues.length,0,'expired status hidden before reset job');
 await db.exec(`reset role;update public.night_statuses set expires_at=now()+interval '1 day',updated_at=public.night_start_at('nyc',now())-interval '1 second' where user_id='${member}';set role authenticated;`);
 assert.equal((await snapshot()).counts.out,0,'pre-5AM row never carries into new night even with bad expiry');
 await db.exec(`reset role;update public.night_statuses set updated_at=public.night_start_at('nyc',now()) where user_id='${member}';set role authenticated;`);
 assert.equal((await snapshot()).counts.out,1,'no blanket two-hour freshness cutoff');
 assert.equal((await snapshot('la')).counts.out,0,'NYC activity does not enter LA');
 await db.exec(`reset role;insert into spotted_private.usage_exclusions values('${member}');set role authenticated;`);
 assert.equal((await snapshot()).counts.out,0,'analytics exclusion applies at read time');
 await db.exec(`reset role;delete from spotted_private.usage_exclusions;insert into spotted_private.night_mode_testers values('${member}');set role authenticated;`);
 assert.equal((await snapshot()).venues.length,0,'tester isolation');
 await db.exec(`reset role;delete from spotted_private.night_mode_testers;update public.night_statuses set is_demo=true where user_id='${member}';set role authenticated;`);
 assert.equal((await snapshot()).counts.out,0,'demo status on real account excluded');
 await db.exec(`reset role;update public.night_statuses set is_demo=false where user_id='${member}';
 insert into spotted_private.launch_waves values('${a}','First wave');
 delete from spotted_private.launch_guests;
 insert into spotted_private.launch_guests(id,name,wave_id) values('${a}','Not invited','${a}');
 insert into spotted_private.launch_guests(id,name,wave_id,invited_at,claimed_at,claimed_by) values('${b}','Visible member','${a}',now()-interval '2 days',now()-interval '1 day','${member}');
 set role authenticated;`);
 const roster=(await q('select public.command_launch_roster() r'))[0].r;
 assert.equal(roster.total,2);assert.equal(roster.rows.find(p=>p.id===a).attention,'not_invited');
 assert.equal(roster.rows.find(p=>p.id===b).friends,1,'reciprocal friendship rows deduplicated');
 assert.equal(roster.rows.find(p=>p.id===b).attention,'activated');
 for(const field of ['phone','email','venue_id','lat','lng','claimed_by'])assert.ok(!roster.rows.some(p=>field in p),'Roster has no '+field);
 s=await snapshot();assert.equal(s.readiness.phone_gate_enabled,false);assert.equal(s.readiness.install_link_saved,false);
 await db.exec(`reset role;update spotted_private.launch_operators set founder_monitor=false where user_id='${founder}';set role authenticated;`);
 await assert.rejects(db.query('select public.command_launch_night()'),/Founder monitoring/);
 await assert.rejects(db.query('select public.command_launch_roster()'),/Founder monitoring/);
 await db.exec('reset role');
 console.log('PASS: launch counts, real privacy helpers, audience/block/hiding/participation, public venue identity, no private GPS, city boundaries, 5AM expiry, duplicate actions, stop sharing, demo/test isolation, roster milestones, and revoked founder access.');
}
