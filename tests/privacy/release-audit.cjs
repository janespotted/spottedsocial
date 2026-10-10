// Synthetic PostgreSQL only. No hosted credentials or network requests.
const { PGlite } = require(process.env.SPOTTED_PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261009213458_release_audit_privacy_and_plan_counts.sql'), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, C, D, P, U, DEMO, V] = [1, 2, 3, 4, 5, 6, 100].map(id);
const results = [];

async function run(variant) {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
  for (const file of ['audited-schema.sql', 'audited-storage.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  }
  await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz; create publication supabase_realtime');
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n =>
    n.startsWith('202609222') || n.includes('_v1_') || /^2026100[567]/.test(n)).sort()) {
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  if (variant !== 'text-first') {
    if (variant === 'uuid-first') await db.exec('drop function public.create_group_thread(text,uuid[])');
    const legacy = fs.readFileSync(path.join(root, 'supabase/migrations/20251209065113_13dace6b-0f99-48c9-900a-b5f33c2d264b.sql'), 'utf8');
    await db.exec(legacy.split('-- Create function to create group threads')[1]);
  }
  await q("select set_config('request.jwt.claim.role','service_role',false)");
  for (let n = 1; n <= 75; n++) {
    await q('insert into auth.users(id) values($1)', [id(n)]);
    await q("insert into profiles(id,display_name,username,city,is_demo) values($1,$2,$3,'nyc',$4)", [id(n), `Test ${n}`, `test${n}`, n === 6]);
    if (n >= 7) await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')", [A, id(n)]);
  }
  await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted'),($3,$1,'accepted'),($1,$4,'pending')", [A, C, D, P]);
  await q("insert into venues(id,name,city,lat,lng,type,is_demo,neighborhood) values($1,'Test venue','nyc',40.7,-74,'bar',false,'Test')", [V]);
  await q("insert into spotted_private.night_mode_testers(user_id,override,note) values($1,'night','Isolated test')", [A]);

  async function actor(who, sql, args = [], role = who ? 'authenticated' : 'anon') {
    await db.exec('savepoint actor');
    await q("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true)", [who || '', role]);
    await db.exec('set local role ' + role);
    try {
      const rows = await q(sql, args);
      await db.exec('reset role');
      return { rows };
    } catch (error) {
      await db.exec('rollback to actor');
      return { rows: [], error: error.message, code: error.code };
    }
  }
  async function test(name, fn) {
    await db.exec('begin');
    try {
      await fn();
      results.push({ variant, name, pass: true });
      console.log('PASS', variant, name);
    } catch (error) {
      results.push({ variant, name, pass: false, error: error.message });
      console.error('FAIL', variant, name, error.message);
    } finally { await db.exec('rollback'); }
  }
  const ok = r => { assert(!r.error, r.error); return r.rows; };
  const denied = r => assert(r.code === '42501' || (!r.error && !r.rows.length), JSON.stringify(r));
  const group = (members, name = 'Regression', who = A, role) => actor(who,
    'select public.create_group_thread(group_name=>$1,member_ids=>$2::uuid[]) id', [name, members], role);
  async function rejectGroup(members, name, who, role) {
    const before = await scalar('select count(*)::int from dm_threads');
    const r = await group(members, name, who, role);
    assert(['42501', '22023'].includes(r.code), 'Expected validation denial: ' + JSON.stringify(r));
    assert.equal(await scalar('select count(*)::int from dm_threads'), before, 'No partial group');
  }

  // Seed stale counters before migration; participants' writes previously missed the parent.
  const plan = (await q("insert into plans(user_id,venue_name,plan_date,plan_time,visibility,expires_at) values($1,'Test',current_date,'23:00','friends',now()+interval '2 hours') returning id", [A]))[0].id;
  await db.exec('begin');
  ok(await actor(C, "insert into plan_votes(plan_id,user_id,vote_type) values($1,$2,'up') returning id", [plan, C]));
  ok(await actor(C, "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Test') returning id", [plan, C]));
  await db.exec('commit');
  await db.exec(migration);
  await db.exec(migration);
  if (process.env.SPOTTED_LAUNCH_MIGRATION === '1') await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261010230431_nyc_onboarding_waves.sql'),'utf8'));

  await test('Migration applies twice and consolidates both historical overloads', async () => {
    assert.equal(await scalar("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_group_thread'"), 1);
    assert.equal(await scalar("select has_function_privilege('anon','public.create_group_thread(uuid[],text)','EXECUTE')"), false);
  });
  await test('Accepted friends in either direction and duplicate normalization', async () => {
    const [{ id: thread }] = ok(await group([C, D, C]));
    assert.equal(await scalar('select count(*)::int from dm_thread_members where thread_id=$1', [thread]), 3);
    assert.equal(ok(await actor(C, 'select user_id from dm_thread_members where thread_id=$1', [thread])).length, 3);
    denied(await actor(U, 'select user_id from dm_thread_members where thread_id=$1', [thread]));
  });
  await test('Anonymous caller', () => rejectGroup([C, D], 'Test', null, 'anon'));
  await test('Missing authenticated identity', () => rejectGroup([C, D], 'Test', null, 'authenticated'));
  for (const [name, members] of [
    ['One member', [C]], ['Duplicate-only members', [C, C]], ['Null list', null], ['Null member', [C, null]],
    ['Self', [A, C]], ['Pending friend', [C, P]], ['Unknown person', [C, id(999)]], ['Demo person', [C, DEMO]],
    ['Unrelated person', [C, U]], ['65 members', Array.from({ length: 65 }, (_, i) => id(i + 7))],
  ]) await test(name + ' rejected atomically', () => rejectGroup(members));
  await test('Overlong name', () => rejectGroup([C, D], 'x'.repeat(1000)));
  for (const [a, b] of [[A, C], [C, A], [C, D], [D, C]]) await test(`Blocked pair ${a.slice(-1)}→${b.slice(-1)}`, async () => {
    await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)', [a, b]);
    await rejectGroup([C, D]);
  });
  await test('Blank name normalizes to null', async () => {
    const [{ id: thread }] = ok(await group([C, D], '   '));
    assert.equal(await scalar('select name from dm_threads where id=$1', [thread]), null);
  });

  if (variant === 'text-first') {
    async function recap() {
      for (const u of [A, C]) await q("insert into checkins(user_id,venue_id,venue_name,lat,lng,started_at,ended_at) values($1,$2,'Test venue',40.7,-74,now()-interval '1 hour',now()-interval '10 minutes')", [u, V]);
      const before = ok(await actor(A, 'select build_my_recap_now() recap'))[0].recap;
      assert.equal(before.people[0].friend_id, C);
      return before;
    }
    const readPeople = async () => ok(await actor(A, 'select get_night_recap() recap'))[0].recap.people;
    for (const [name, sql, args] of [
      ['Hide location', 'insert into location_hidden(user_id,hidden_from_id) values($1,$2)', [C, A]],
      ['Tighten location audience', "update profiles set location_sharing_level='close_friends' where id=$1", [C]],
      ['Block owner', 'insert into blocked_users(blocker_id,blocked_id) values($1,$2)', [C, A]],
      ['Unfriend owner', 'delete from friendships where user_id=$1 and friend_id=$2', [A, C]],
    ]) await test(name + ' removes historic overlap on next read', async () => { await recap(); await q(sql, args); assert.equal((await readPeople()).length, 0); });
    await test('Current close friend remains visible without live GPS', async () => {
      await recap();
      await q('insert into close_friends(user_id,close_friend_id) values($1,$2)', [C, A]);
      await q("update profiles set location_sharing_level='close_friends' where id=$1", [C]);
      await q('delete from night_statuses where user_id=$1', [C]);
      assert.equal((await readPeople()).length, 1);
      await q('delete from close_friends where user_id=$1 and close_friend_id=$2', [C, A]);
      assert.equal((await readPeople()).length, 0);
    });
    await test('Recap owner boundary and anonymous denial', async () => {
      await recap();
      assert.equal(ok(await actor(U, 'select get_night_recap() recap'))[0].recap, null);
      denied(await actor(null, 'select get_night_recap()'));
      denied(await actor(C, 'select * from night_recap_people'));
    });
    await test('Location hiding signals only the affected viewer; clients cannot forge signals', async () => {
      await q('delete from relationship_events');
      ok(await actor(C, 'insert into location_hidden(user_id,hidden_from_id) values($1,$2) returning id', [C, A]));
      const signals = ok(await actor(A, "select other_user_id,kind from relationship_events where kind='location_changed'"));
      assert.deepEqual(signals, [{ other_user_id: C, kind: 'location_changed' }]);
      denied(await actor(U, 'select * from relationship_events'));
      denied(await actor(C, "insert into relationship_events(user_id,other_user_id,kind) values($1,$2,'location_changed') returning id", [A, C]));
    });
    await test('Audience narrowing signals excluded viewers, preserving eligible close friends', async () => {
      await q('insert into close_friends(user_id,close_friend_id) values($1,$2)', [A, C]);
      await q('delete from relationship_events');
      ok(await actor(A, "update profiles set location_sharing_level='close_friends' where id=$1 returning id", [A]));
      assert.equal(ok(await actor(D, "select * from relationship_events where kind='location_changed'")).length, 1);
      assert.equal(ok(await actor(C, "select * from relationship_events where kind='location_changed'")).length, 0);
    });
    await test('Backfill repairs stale plan counters', async () => {
      assert.deepEqual((await q('select score,comments_count from plans where id=$1', [plan]))[0], { score: 1, comments_count: 1 });
    });
    await test('Participant vote insert, flip, delete maintain score without parent edit permission', async () => {
      ok(await actor(D, "insert into plan_votes(plan_id,user_id,vote_type) values($1,$2,'up') returning id", [plan, D]));
      assert.equal(await scalar('select score from plans where id=$1', [plan]), 2);
      ok(await actor(D, "update plan_votes set vote_type='down' where plan_id=$1 and user_id=$2 returning id", [plan, D]));
      assert.equal(await scalar('select score from plans where id=$1', [plan]), 0);
      ok(await actor(D, 'delete from plan_votes where plan_id=$1 and user_id=$2 returning id', [plan, D]));
      assert.equal(await scalar('select score from plans where id=$1', [plan]), 1);
      denied(await actor(D, 'update plans set score=100 where id=$1 returning id', [plan]));
    });
    await test('Participant comment insert and delete maintain count; denied writes do not', async () => {
      const [{ id: comment }] = ok(await actor(D, "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Test') returning id", [plan, D]));
      assert.equal(await scalar('select comments_count from plans where id=$1', [plan]), 2);
      denied(await actor(U, "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Denied') returning id", [plan, U]));
      assert.equal(await scalar('select comments_count from plans where id=$1', [plan]), 2);
      ok(await actor(D, 'delete from plan_comments where id=$1 returning id', [comment]));
      assert.equal(await scalar('select comments_count from plans where id=$1', [plan]), 1);
    });
    await test('Aggregate helpers are private, hardened, and not executable by clients', async () => {
      for (const f of ['update_plan_score', 'update_plan_comments_count']) {
        assert.equal(await scalar(`select has_function_privilege('authenticated','spotted_private.${f}()','EXECUTE')`), false);
        const row = (await q("select prosecdef,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='spotted_private' and p.proname=$1", [f]))[0];
        assert.equal(row.prosecdef, true);
        assert(row.proconfig.some(c => c.startsWith('search_path=')));
      }
      assert.equal(await scalar("select has_function_privilege('authenticated','spotted_private.storage_key(text)','EXECUTE')"), true);
    });
    await test('All subscribed plan tables publish changes, with RLS enabled', async () => {
      for (const t of ['plans', 'plan_votes', 'plan_comments', 'plan_participants', 'plan_downs']) {
        assert.equal(await scalar("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=$1", [t]), 1);
        assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass', ['public.' + t]), true);
      }
    });
  }
  await db.close();
}

(async () => {
  for (const variant of ['text-first', 'uuid-first', 'both']) await run(variant);
  if (process.env.SPOTTED_RELEASE_RESULTS) fs.writeFileSync(process.env.SPOTTED_RELEASE_RESULTS, JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
  process.exitCode = results.some(r => !r.pass) ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
