// Synthetic PostgreSQL roles/RLS, before (32262ddc) and after the beta extension.
const { PGlite } = require(
  process.env.SPOTTED_PGLITE_MODULE || "@electric-sql/pglite",
);
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../.."),
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, C, F, U, M, BR] = [1, 2, 3, 4, 5, 6].map(id), V = id(100);
let total = 0;
const results = [];
const added = (n) =>
  /v1_(beta_access_closure|plans_inbox_privacy|read_receipt_privacy)\.sql$/
    .test(n) || n.includes('_v1_product_');
async function run(fixed) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(__dirname + "/audited-schema.sql", "utf8"));
  await db.exec(fs.readFileSync(__dirname + "/audited-storage.sql", "utf8"));
  await db.exec("alter table auth.users add column phone text");
  for (
    const n of fs.readdirSync(root + "/supabase/migrations").filter((n) =>
      n.startsWith("202609222") ||
      /_v1_privacy_authorization.sql$|_v1_private_media.sql$/.test(n)
    )
  ) await db.exec(fs.readFileSync(root + "/supabase/migrations/" + n, "utf8"));
  if (fixed) {
    for (
      const n of fs.readdirSync(root + "/supabase/migrations").filter(added)
    ) {
      await db.exec(
        fs.readFileSync(root + "/supabase/migrations/" + n, "utf8"),
      );
    }
  }
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const scalar = async (sql, args = []) =>
    Object.values((await q(sql, args))[0] || {})[0];
  async function actor(who, sql, args = []) {
    await db.exec("savepoint actor");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      who || "",
    ]);
    await db.exec("set local role " + (who ? "authenticated" : "anon"));
    try {
      const rows = await q(sql, args);
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',true)");
      return { rows };
    } catch (e) {
      await db.exec("rollback to actor");
      return { rows: [], error: e.message, code: e.code };
    }
  }
  async function test(name, before, after, fn) {
    await db.exec("begin");
    try {
      const actual = await fn();
      const expected = fixed ? after : before;
      results.push({ name, mode: fixed ? "corrected" : "baseline", expected, actual });
      assert.deepEqual(actual, expected, name);
      console.log("PASS", fixed ? "corrected" : "baseline", name);
      total++;
    } finally {
      await db.exec("rollback");
    }
  }
  const denied = (r) => r.code === "42501" || (!r.error && r.rows.length === 0);
  for (const [i, u] of [A, C, F, U, M, BR].entries()) {
    await db.query("insert into auth.users(id,phone) values($1,$2)", [
      u,
      "1555000000" + (i + 1),
    ]);
    await db.query(
      "insert into profiles(id,display_name,username,city) values($1,'Synthetic',$2,'nyc')",
      [u, "synthetic" + i],
    );
  }
  for (const u of [C, F, BR]) {
    await db.query(
      "insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",
      [A, u],
    );
  }
  await db.query(
    "insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",
    [BR, M],
  );
  await db.query(
    "insert into close_friends(user_id,close_friend_id) values($1,$2)",
    [A, C],
  );
  await db.query(
    "insert into venues(id,name,city,lat,lng,type,neighborhood) values($1,'Synthetic venue','nyc',40.7,-74,'bar','Test')",
    [V],
  );
  const plan = async (visibility = "close_friends", expired = false) =>
    (await q(
      "insert into plans(user_id,venue_id,venue_name,plan_date,plan_time,expires_at,visibility) values($1,$2,'Synthetic private venue',current_date,'22:00',now()+$3::interval,$4) returning id",
      [A, V, expired ? "-1 minute" : "2 hours", visibility],
    ))[0].id;
  const thread = async () => {
    const r = await actor(A, "select create_dm_thread($1) id", [F]);
    assert(!r.error, r.error);
    return r.rows[0].id;
  };
  await test(
    "P0-09 anonymous raw phone lookup denied",
    false,
    true,
    async () =>
      denied(
        await actor(null, "select * from match_phones(array['15550000001'])"),
      ),
  );
  await test(
    "P0-09 authenticated raw lookup cannot bypass limits",
    false,
    true,
    async () =>
      denied(
        await actor(U, "select * from match_phones(array['15550000001'])"),
      ),
  );
  await test(
    "P0-09 anonymous graph enumeration denied",
    false,
    true,
    async () =>
      denied(await actor(null, "select * from get_mutual_friend_ids($1)", [A])),
  );
  await test(
    "P0-09 anonymous mutual relationship probe denied",
    false,
    true,
    async () => {
      const r = await actor(null, "select is_mutual_friend($1,$2) allowed", [
        A,
        M,
      ]);
      return denied(r) || r.rows[0]?.allowed === false;
    },
  );
  await test(
    "graph viewer impersonation denied",
    true,
    true,
    async () =>
      denied(await actor(U, "select * from get_mutual_friend_ids($1)", [A])),
  );
  await test(
    "legitimate mutual discovery remains available",
    true,
    true,
    async () =>
      (await actor(A, "select * from get_mutual_friend_ids($1)", [A])).rows
        .some((r) => r.user_id === M),
  );
  await test(
    "P0-10 hidden plan downs not anonymously readable",
    false,
    true,
    async () => {
      const p = await plan();
      await q("insert into plan_downs(plan_id,user_id) values($1,$2)", [p, C]);
      return denied(
        await actor(null, "select user_id from plan_downs where plan_id=$1", [
          p,
        ]),
      );
    },
  );
  await test(
    "P0-10 hidden plan votes not anonymously readable",
    false,
    true,
    async () => {
      const p = await plan();
      await q(
        "insert into plan_votes(plan_id,user_id,vote_type) values($1,$2,'up')",
        [p, C],
      );
      return denied(
        await actor(null, "select user_id from plan_votes where plan_id=$1", [
          p,
        ]),
      );
    },
  );
  for (const t of ["plan_downs", "plan_votes", "plan_comments"]) {
    await test(
      "P0-10 outsider cannot write hidden " + t,
      false,
      true,
      async () => {
        const p = await plan();
        const extra = t === "plan_votes"
          ? [",vote_type", ",'up'"]
          : t === "plan_comments"
          ? [",text", ",'Synthetic'"]
          : ["", ""];
        return (await actor(
          U,
          `insert into ${t}(plan_id,user_id${extra[0]}) values($1,$2${
            extra[1]
          })`,
          [p, U],
        )).code === "42501";
      },
    );
  }
  await test(
    "P0-10 expired friend plan denied before cleanup",
    false,
    true,
    async () =>
      denied(
        await actor(F, "select venue_name from plans where id=$1", [
          await plan("friends", true),
        ]),
      ),
  );
  await test(
    "P0-10 normal friend cannot be tagged into close-only plan",
    false,
    true,
    async () =>
      denied(
        await actor(
          A,
          "insert into plan_participants(plan_id,user_id) values($1,$2) returning id",
          [await plan(), F],
        ),
      ),
  );
  await test(
    "eligible Close Friend reads and comments",
    true,
    true,
    async () => {
      const p = await plan();
      const a = await actor(C, "select venue_name from plans where id=$1", [p]);
      const b = await actor(
        C,
        "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Allowed') returning id",
        [p, C],
      );
      return a.rows.length === 1 && b.rows.length === 1;
    },
  );
  await test(
    "normal friend reads friends plan and votes",
    true,
    true,
    async () => {
      const p = await plan("friends");
      return (await actor(
        F,
        "insert into plan_votes(plan_id,user_id,vote_type) values($1,$2,'up') returning id",
        [p, F],
      )).rows.length === 1;
    },
  );
  await test("new block revokes plan access", true, true, async () => {
    const p = await plan("friends");
    await q("insert into blocked_users(blocker_id,blocked_id) values($1,$2)", [
      A,
      F,
    ]);
    return denied(
      await actor(F, "select venue_name from plans where id=$1", [p]),
    );
  });
  await test(
    "P0-11 anonymous private Yap reply and author denied",
    false,
    true,
    async () => {
      const y = (await q(
        "insert into yap_messages(user_id,venue_name,text,expires_at,is_private_party) values($1,'Private','Synthetic',now()+interval '1 hour',true) returning id",
        [A],
      ))[0].id;
      await q(
        "insert into yap_comments(user_id,yap_id,text) values($1,$2,'Secret')",
        [A, y],
      );
      return denied(
        await actor(
          null,
          "select text,user_id from yap_comments where yap_id=$1",
          [y],
        ),
      );
    },
  );
  await test(
    "P0-11 signed-in users cannot write Yap",
    false,
    true,
    async () =>
      (await actor(
        A,
        "insert into yap_messages(user_id,venue_name,text,expires_at) values($1,'Venue','Synthetic',now()+interval '1 hour')",
        [A],
      )).code === "42501",
  );
  await test(
    "P0-11 callable Yap vote RPC is closed",
    false,
    true,
    async () =>
      !(await scalar(
        "select has_function_privilege('authenticated','public.vote_on_yap(uuid,text)','execute')",
      )),
  );
  await test(
    "P0-12 peer cannot see opted-out receipt",
    false,
    true,
    async () => {
      const t = await thread();
      await q("update profiles set show_read_receipts=false where id=$1", [A]);
      await actor(
        A,
        "insert into dm_read_receipts(thread_id,user_id) values($1,$2)",
        [t, A],
      );
      return denied(
        await actor(
          F,
          "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
          [t, A],
        ),
      );
    },
  );
  await test(
    "private unread position still persists with sharing off",
    true,
    true,
    async () => {
      const t = await thread();
      await q("update profiles set show_read_receipts=false where id=$1", [A]);
      const a = await actor(
        A,
        "insert into dm_read_receipts(thread_id,user_id) values($1,$2) on conflict(thread_id,user_id) do update set last_read_at=now() returning last_read_at",
        [t, A],
      );
      const b = await actor(
        A,
        "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
        [t, A],
      );
      return a.rows.length === 1 && b.rows.length === 1;
    },
  );
  await test(
    "mutual opt-in exposes legitimate peer receipt",
    true,
    true,
    async () => {
      const t = await thread();
      await q(
        "update profiles set show_read_receipts=true where id in($1,$2)",
        [A, F],
      );
      await actor(
        A,
        "insert into dm_read_receipts(thread_id,user_id) values($1,$2)",
        [t, A],
      );
      return (await actor(
        F,
        "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
        [t, A],
      )).rows.length === 1;
    },
  );
  await test(
    "P0-12 viewer opt-out also denies peer receipt",
    false,
    true,
    async () => {
      const t = await thread();
      await q(
        "update profiles set show_read_receipts=(id=$1) where id in($1,$2)",
        [A, F],
      );
      await actor(
        A,
        "insert into dm_read_receipts(thread_id,user_id) values($1,$2)",
        [t, A],
      );
      return denied(
        await actor(
          F,
          "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
          [t, A],
        ),
      );
    },
  );
  await test(
    "P0-13 revoked location disappears from inbox and push",
    false,
    true,
    async () => {
      await q(
        "insert into night_statuses(user_id,status,venue_id,venue_name,expires_at) values($1,'out',$2,'Venue',now()+interval '2 hours')",
        [A, V],
      );
      const n = (await q(
        "select id from notifications where sender_id=$1 and receiver_id=$2 and type='friend_out'",
        [A, F],
      ))[0].id;
      await q(
        "insert into location_hidden(user_id,hidden_from_id) values($1,$2)",
        [A, F],
      );
      return denied(
        await actor(F, "select message,data from notifications where id=$1", [
          n,
        ]),
      ) && await scalar("select push_notification_allowed($1)", [n]) === false;
    },
  );
  await test(
    "P0-13 source-less private plan alert cannot be forged",
    false,
    true,
    async () =>
      denied(
        await actor(
          A,
          "select * from create_notification($1,'plan_invite','Synthetic private venue')",
          [F],
        ),
      ),
  );
  await test(
    "P0-13 old source-less plan inbox and push fail closed",
    false,
    true,
    async () => {
      const n = (await q(
        "insert into notifications(sender_id,receiver_id,type,message) values($1,$2,'plan_invite','Synthetic private venue') returning id",
        [A, F],
      ))[0].id;
      return denied(
        await actor(F, "select message from notifications where id=$1", [n]),
      ) && await scalar("select push_notification_allowed($1)", [n]) === false;
    },
  );
  await test(
    "P0-14 unrelated and anonymous log reads denied",
    false,
    true,
    async () => {
      await q(
        "insert into push_logs(user_id,type) values($1,'private_party_invite')",
        [A],
      );
      return denied(await actor(null, "select * from push_logs")) &&
        denied(await actor(U, "select * from push_logs"));
    },
  );
  await test(
    "P0-14 arbitrary client log inserts denied",
    false,
    true,
    async () =>
      denied(
        await actor(
          U,
          "insert into push_logs(user_id,type) values($1,'dm') returning id",
          [A],
        ),
      ),
  );
  await test(
    "P0-10 historical blocked friendship cannot read plan",
    false,
    true,
    async () => {
      const p = await plan("friends");
      await db.exec(
        "alter table blocked_users disable trigger v1_block_cleanup",
      );
      await q(
        "insert into blocked_users(blocker_id,blocked_id) values($1,$2)",
        [A, F],
      );
      await db.exec(
        "alter table blocked_users enable trigger v1_block_cleanup",
      );
      return denied(
        await actor(F, "select venue_name from plans where id=$1", [p]),
      );
    },
  );
  await test(
    "P0-12 blocked peer loses even enabled receipt",
    false,
    true,
    async () => {
      const t = await thread();
      await q(
        "update profiles set show_read_receipts=true where id in($1,$2)",
        [A, F],
      );
      await actor(
        A,
        "insert into dm_read_receipts(thread_id,user_id) values($1,$2)",
        [t, A],
      );
      await q(
        "insert into blocked_users(blocker_id,blocked_id) values($1,$2)",
        [A, F],
      );
      return denied(
        await actor(
          F,
          "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
          [t, A],
        ),
      );
    },
  );
  await test(
    "P0-13 batch RPC cannot forge source-less plan notification",
    false,
    true,
    async () =>
      denied(
        await actor(A, "select * from create_notifications_batch($1)", [[{
          receiver_id: F,
          type: "plan_invite",
          message: "Synthetic secret",
        }]]),
      ),
  );
  if (fixed) {
    await test(
      "plan child row identities cannot be reassigned",
      null,
      true,
      async () => {
        const p = await plan("friends");
        const r = await actor(
          F,
          "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Own') returning id",
          [p, F],
        );
        return !!(await actor(
          F,
          "update plan_comments set plan_id=$1 where id=$2",
          [await plan(), r.rows[0].id],
        )).error;
      },
    );
    await test(
      "hidden plan participants and comments remain private",
      null,
      true,
      async () => {
        const p = await plan();
        await actor(
          A,
          "insert into plan_participants(plan_id,user_id) values($1,$2)",
          [p, C],
        );
        await actor(
          C,
          "insert into plan_comments(plan_id,user_id,text) values($1,$2,'Private')",
          [p, C],
        );
        return denied(
          await actor(U, "select * from plan_participants where plan_id=$1", [
            p,
          ]),
        ) &&
          denied(
            await actor(U, "select * from plan_comments where plan_id=$1", [p]),
          );
      },
    );
    await test(
      "deleting a plan deletes only its notifications and children",
      null,
      true,
      async () => {
        const p = await plan("friends"), other = await plan("friends");
        for (const x of [p, other]) {
          await actor(
            A,
            "insert into plan_participants(plan_id,user_id) values($1,$2)",
            [x, F],
          );
        }
        await actor(A, "delete from plans where id=$1", [p]);
        return await scalar(
              "select count(*)::int from notifications where data->>'plan_id'=$1",
              [p],
            ) === 0 &&
          await scalar(
              "select count(*)::int from notifications where data->>'plan_id'=$1",
              [other],
            ) === 1 &&
          await scalar(
              "select count(*)::int from plan_participants where plan_id=$1",
              [p],
            ) === 0;
      },
    );
    await test(
      "participant removal revokes old invitation",
      null,
      true,
      async () => {
        const p = await plan("friends");
        await actor(
          A,
          "insert into plan_participants(plan_id,user_id) values($1,$2)",
          [p, F],
        );
        const n =
          (await q("select id from notifications where data->>'plan_id'=$1", [
            p,
          ]))[0].id;
        await actor(A, "delete from plan_participants where plan_id=$1", [p]);
        return denied(
          await actor(F, "select * from notifications where id=$1", [n]),
        ) &&
          await scalar("select push_notification_allowed($1)", [n]) === false;
      },
    );
    await test(
      "expired and edited plans suppress old alerts",
      null,
      true,
      async () => {
        const p = await plan("friends");
        await actor(
          A,
          "insert into plan_participants(plan_id,user_id) values($1,$2)",
          [p, F],
        );
        const n =
          (await q("select id from notifications where data->>'plan_id'=$1", [
            p,
          ]))[0].id;
        await actor(
          A,
          "update plans set venue_name='Changed venue' where id=$1",
          [p],
        );
        assert(
          denied(
            await actor(F, "select * from notifications where id=$1", [n]),
          ),
        );
        await actor(A, "update plans set expires_at=now() where id=$1", [p]);
        return await scalar("select push_notification_allowed($1)", [n]) ===
          false;
      },
    );
    await test(
      "friendship revocation hides sensitive post notification text",
      null,
      true,
      async () => {
        const p = (await q(
          "insert into posts(user_id,text,visibility,expires_at) values($1,'Post','all_friends',now()+interval '1 hour') returning id",
          [A],
        ))[0].id;
        await actor(
          A,
          "insert into post_tags(post_id,tagged_user_id) values($1,$2)",
          [p, F],
        );
        const n = (await q(
          "select id from notifications where type='post_tag' and data->>'post_id'=$1",
          [p],
        ))[0].id;
        assert(
          (await actor(F, "select * from notifications where id=$1", [n])).rows
            .length === 1,
        );
        const changed = await actor(A, "select remove_friendship($1)", [F]);
        assert(!changed.error, changed.error);
        return denied(
          await actor(F, "select * from notifications where id=$1", [n]),
        );
      },
    );
    await test(
      "DM preview requires retained source and current membership",
      null,
      true,
      async () => {
        const t = await thread();
        const m = (await actor(
          A,
          "insert into dm_messages(thread_id,sender_id,text) values($1,$2,'Private DM') returning id",
          [t, A],
        )).rows[0].id;
        const n = (await q(
          "select id from notifications where type='dm' and receiver_id=$1",
          [F],
        ))[0].id;
        assert(
          (await actor(F, "select message from notifications where id=$1", [n]))
            .rows.length === 1,
        );
        await q("delete from dm_messages where id=$1", [m]);
        return denied(
          await actor(F, "select message from notifications where id=$1", [n]),
        ) &&
          await scalar("select push_notification_allowed($1)", [n]) === false;
      },
    );
    await test(
      "private-party Activity retains consent behavior and revokes on stop",
      null,
      true,
      async () => {
        await q(
          "insert into night_statuses(user_id,status,is_private_party,party_address,expires_at) values($1,'out',true,'Synthetic address',now()+interval '2 hours')",
          [A],
        );
        const pr = await actor(A, "select party_request($1,$2,'invite') id", [
          A,
          F,
        ]);
        assert(!pr.error, pr.error);
        const n = (await q(
          "select id from notifications where type='private_party_invite' and receiver_id=$1",
          [F],
        ))[0].id;
        assert(
          (await actor(F, "select message from notifications where id=$1", [n]))
            .rows.length === 1,
        );
        await actor(F, "select respond_party_request($1,true)", [
          pr.rows[0].id,
        ]);
        assert.equal(
          (await actor(F, "select approved_party_address($1) address", [A]))
            .rows[0].address,
          null,
        );
        await q("update night_statuses set status='home' where user_id=$1", [
          A,
        ]);
        return denied(
          await actor(F, "select message from notifications where id=$1", [n]),
        );
      },
    );
    await test(
      "server notification helpers cannot be invoked as bypasses",
      null,
      true,
      async () => {
        for (const role of ["anon", "authenticated"]) {
          assert.equal(
            await scalar(
              "select has_function_privilege($1,'spotted_private.notification_source_visible(public.notifications)','execute')",
              [role],
            ),
            false,
          );
        }
        return denied(await actor(U, "select message from notifications"));
      },
    );
    await test(
      "receipt write requires actual membership",
      null,
      true,
      async () => {
        const t = await thread();
        return denied(
          await actor(
            U,
            "insert into dm_read_receipts(thread_id,user_id) values($1,$2) returning last_read_at",
            [t, U],
          ),
        );
      },
    );
    await test(
      "anonymous Auth sessions cannot use matching through the direct RPC",
      null,
      true,
      async () => {
        await db.exec(
          "create or replace function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('is_anonymous',true)$$",
        );
        return denied(
          await actor(U, "select * from match_contacts(array['15550000001'])"),
        );
      },
    );
    await test(
      "phone-number hourly and daily budgets persist independently",
      null,
      true,
      async () => {
        await actor(U, "select * from match_contacts(array['15550000001'])");
        await q(
          "update spotted_private.contact_match_usage set hour_numbers=1000 where user_id=$1",
          [U],
        );
        assert.equal(
          (await actor(U, "select * from match_contacts(array['15550000001'])"))
            .code,
          "P0001",
        );
        await q(
          "update spotted_private.contact_match_usage set hour_start=now()-interval '2 hours',day_numbers=2000 where user_id=$1",
          [U],
        );
        assert.equal(
          (await actor(U, "select * from match_contacts(array['15550000001'])"))
            .code,
          "P0001",
        );
        await q(
          "update spotted_private.contact_match_usage set day_start=now()-interval '2 days' where user_id=$1",
          [U],
        );
        const r = await actor(
          U,
          "select * from match_contacts(array['15550000001'])",
        );
        return !r.error && r.rows.length === 1;
      },
    );
    await test(
      "one account cannot alter or consume another contact budget",
      null,
      true,
      async () => {
        await actor(U, "select * from match_contacts(array['15550000001'])");
        await q(
          "update spotted_private.contact_match_usage set hour_requests=20 where user_id=$1",
          [U],
        );
        assert(
          denied(
            await actor(
              U,
              "delete from spotted_private.contact_match_usage returning user_id",
            ),
          ),
        );
        return (await actor(
          F,
          "select * from match_contacts(array['15550000001'])",
        )).rows.length === 1;
      },
    );
    await test(
      "blocked mutual target and bridge are excluded",
      null,
      true,
      async () => {
        await q(
          "insert into blocked_users(blocker_id,blocked_id) values($1,$2)",
          [A, M],
        );
        assert(
          denied(
            await actor(A, "select * from get_mutual_friend_ids($1)", [A]),
          ),
        );
        return denied(
          await actor(A, "select * from get_mutual_friends_with($1)", [M]),
        );
      },
    );
    await test(
      "plan edit and participant replacement are atomic",
      null,
      true,
      async () => {
        const values = {
          venue_id: V,
          plan_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          plan_time: "22:00",
          visibility: "friends",
        };
        const p =
          (await actor(A, "select save_plan(null,$1,array[$2]::uuid[]) id", [
            values,
            F,
          ])).rows[0].id;
        const updated = await actor(
          A,
          "select save_plan($1,$2,array[$3]::uuid[])",
          [p, { ...values, visibility: "close_friends" }, C],
        );
        assert(!updated.error, updated.error);
        return denied(
          await actor(F, "select id from plans where id=$1", [p]),
        ) &&
          (await actor(C, "select id from plans where id=$1", [p])).rows
              .length === 1 &&
          await scalar(
              "select count(*)::int from plan_participants where plan_id=$1 and user_id=$2",
              [p, F],
            ) === 0;
      },
    );
    await test(
      "plan save cannot edit someone else or smuggle privileged fields",
      null,
      true,
      async () => {
        const p = await plan();
        const values = {
          venue_id: V,
          plan_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          plan_time: "22:00",
          visibility: "friends",
        };
        return denied(
          await actor(U, "select save_plan($1,$2,'{}')", [p, values]),
        ) &&
          !!(await actor(A, "select save_plan(null,$1,'{}')", [{
            ...values,
            user_id: U,
          }])).error;
      },
    );
    await test(
      "LA plan expiry is computed from the owner city",
      null,
      true,
      async () => {
        await q("update profiles set city='la' where id=$1", [A]);
        const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const p = (await actor(A, "select save_plan(null,$1,'{}') id", [{
          venue_id: V,
          plan_date: day,
          plan_time: "22:00",
          visibility: "friends",
        }])).rows[0].id;
        return await scalar(
          "select expires_at=(($2::date+1)+time '05:00') at time zone 'America/Los_Angeles' from plans where id=$1",
          [p, day],
        );
      },
    );
    await test(
      "venue and meetup invitations retain legitimate native behavior",
      null,
      true,
      async () => {
        for (
          const type of [
            "venue_invite",
            "venue_invite_accepted",
            "meetup_request",
            "meetup_accepted",
          ]
        ) {
          const n =
            (await actor(A, "select * from create_notification($1,$2,$3)", [
              F,
              type,
              "Synthetic invitation",
            ])).rows[0];
          assert(n);
          assert(
            (await actor(F, "select message from notifications where id=$1", [
              n.id,
            ])).rows.length === 1,
          );
          assert.equal(
            await scalar("select push_notification_allowed($1)", [n.id]),
            true,
          );
        }
        return true;
      },
    );
    await test("eligible mutual meetup works; unrelated and blocked attempts are denied", null, true, async () => {
      for (const type of ["meetup_request", "meetup_accepted"]) {
        const n = (await actor(A, "select * from create_notification($1,$2,$3)", [M,type,"Synthetic mutual invitation"])).rows[0];
        assert(n);
        assert.equal((await actor(M,"select id from notifications where id=$1",[n.id])).rows.length,1);
        assert.equal(await scalar("select push_notification_allowed($1)",[n.id]),true);
        assert.equal((await actor(U,"select * from create_notification($1,$2,$3)",[M,type,"Unrelated"])).rows.length,0);
      }
      await q("insert into blocked_users(blocker_id,blocked_id) values($1,$2)",[M,A]);
      assert.equal((await actor(A,"select * from create_notification($1,'meetup_request','Blocked')",[M])).rows.length,0);
      assert.equal((await actor(M,"select id from notifications where sender_id=$1",[A])).rows.length,0);
      return true;
    });
    await test(
      "pending request Activity survives, canceled request is suppressed",
      null,
      true,
      async () => {
        const f = (await actor(
          U,
          "insert into friendships(user_id,friend_id,status) values($1,$2,'pending') returning id",
          [U, A],
        )).rows[0].id;
        const n = (await q(
          "select id from notifications where sender_id=$1 and receiver_id=$2 and type='friend_request'",
          [U, A],
        ))[0].id;
        assert(
          (await actor(A, "select message from notifications where id=$1", [n]))
            .rows.length === 1,
        );
        await actor(U, "delete from friendships where id=$1", [f]);
        return denied(
          await actor(A, "select message from notifications where id=$1", [n]),
        ) &&
          await scalar("select push_notification_allowed($1)", [n]) === false;
      },
    );
    await test(
      "bounded contact matching returns only submitted eligible contacts",
      null,
      true,
      async () => {
        const r = await actor(
          U,
          "select * from match_contacts(array['+15550000001','15550000001','15550009999'])",
        );
        assert(!r.error, r.error);
        return r.rows.length === 1 && r.rows[0].user_id === A;
      },
    );
    await test(
      "contact matching denies anonymous callers",
      null,
      true,
      async () =>
        denied(
          await actor(
            null,
            "select * from match_contacts(array['15550000001'])",
          ),
        ),
    );
    await test("contact matching honors blocks", null, true, async () => {
      await q(
        "insert into blocked_users(blocker_id,blocked_id) values($1,$2)",
        [A, U],
      );
      return (await actor(
        U,
        "select * from match_contacts(array['15550000001'])",
      )).rows.length === 0;
    });
    await test(
      "contact matching validates batch and format",
      null,
      true,
      async () => {
        const a = await actor(
          U,
          "select * from match_contacts(array_fill('15550000001'::text,array[501]))",
        );
        const b = await actor(
          U,
          "select * from match_contacts(array['invalid'])",
        );
        return a.code === "22023" && b.code === "22023";
      },
    );
    await test(
      "contact rate limits cannot be bypassed through direct RPC",
      null,
      true,
      async () => {
        for (let i = 0; i < 20; i++) {
          const r = await actor(
            U,
            "select * from match_contacts(array['15550000001'])",
          );
          assert(!r.error, r.error);
        }
        return (await actor(
          U,
          "select * from match_contacts(array['15550000001'])",
        )).code === "P0001";
      },
    );
    await test(
      "active service role retains Yap cleanup and push logging",
      null,
      true,
      async () => {
        await db.exec("set local role service_role");
        await q("insert into push_logs(user_id,type) values($1,'dm')", [A]);
        await q("delete from yap_comments");
        await q("delete from yap_messages");
        await db.exec("reset role");
        return true;
      },
    );
    await test(
      "venue browsing remains available",
      null,
      true,
      async () =>
        (await actor(F, "select name from venues where id=$1", [V])).rows
          .length === 1,
    );
    await test(
      "all client Yap table and RPC grants removed",
      null,
      true,
      async () => {
        const tables = [
          "yap_messages",
          "yap_comments",
          "yap_votes",
          "yap_comment_votes",
          "venue_yap_messages",
        ];
        for (const t of tables) {
          for (const role of ["anon", "authenticated"]) {
            assert.equal(
              await scalar(
                "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",
                [role, "public." + t],
              ),
              false,
            );
          }
        }
        return !(await scalar(
          "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%yap%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')))",
        ));
      },
    );
    await test(
      "atomic plan save and authorized source invite",
      null,
      true,
      async () => {
        const r = await actor(
          A,
          "select save_plan(null,$1,array[$2]::uuid[]) id",
          [{
            venue_id: V,
            plan_date: new Date(Date.now() + 86400000).toISOString().slice(
              0,
              10,
            ),
            plan_time: "22:00",
            visibility: "close_friends",
          }, C],
        );
        assert(!r.error, r.error);
        const n = (await q(
          "select id,data from notifications where type='plan_invite' and data->>'plan_id'=$1",
          [r.rows[0].id],
        ))[0];
        return !!n &&
          (await actor(C, "select message from notifications where id=$1", [
              n.id,
            ])).rows.length === 1 &&
          await scalar("select push_notification_allowed($1)", [n.id]) === true;
      },
    );
    await test(
      "invalid tagged audience rolls back entire plan save",
      null,
      true,
      async () => {
        const before = await scalar("select count(*) from plans");
        const r = await actor(
          A,
          "select save_plan(null,$1,array[$2]::uuid[])",
          [{
            venue_id: V,
            plan_date: new Date(Date.now() + 86400000).toISOString().slice(
              0,
              10,
            ),
            plan_time: "22:00",
            visibility: "close_friends",
          }, F],
        );
        return !!r.error &&
          await scalar("select count(*) from plans") === before;
      },
    );
    await test(
      "source down creates legitimate owner notification once",
      null,
      true,
      async () => {
        const p = await plan("friends");
        await actor(
          F,
          "insert into plan_downs(plan_id,user_id) values($1,$2)",
          [p, F],
        );
        const n = (await q(
          "select id from notifications where type='plan_down' and data->>'plan_id'=$1",
          [p],
        ))[0];
        return !!n &&
          (await actor(A, "select message from notifications where id=$1", [
              n.id,
            ])).rows.length === 1;
      },
    );
    await test(
      "audience tightening revokes plan invite inbox and queue",
      null,
      true,
      async () => {
        const p = await plan("friends");
        await actor(
          A,
          "insert into plan_participants(plan_id,user_id) values($1,$2)",
          [p, F],
        );
        const n = (await q(
          "select id from notifications where type='plan_invite' and data->>'plan_id'=$1",
          [p],
        ))[0].id;
        await actor(
          A,
          "update plans set visibility='close_friends' where id=$1",
          [p],
        );
        return denied(
          await actor(F, "select message from notifications where id=$1", [n]),
        ) &&
          await scalar("select push_notification_allowed($1)", [n]) === false;
      },
    );
    await test(
      "push opt-out does not erase authorized Activity history",
      null,
      true,
      async () => {
        await q(
          "insert into night_statuses(user_id,status,expires_at) values($1,'out',now()+interval '2 hours')",
          [A],
        );
        const n = (await q(
          "select id from notifications where type='friend_out' and receiver_id=$1",
          [F],
        ))[0].id;
        await q(
          "insert into notification_preferences(user_id,out_scope) values($1,'none')",
          [F],
        );
        return (await actor(
              F,
              "select message from notifications where id=$1",
              [n],
            )).rows.length === 1 &&
          await scalar("select push_notification_allowed($1)", [n]) === false;
      },
    );
    await test(
      "mark-read cannot rewrite private notification payload",
      null,
      true,
      async () => {
        const n = (await actor(
          A,
          "select * from create_notification($1,'venue_invite','Synthetic venue invite')",
          [F],
        )).rows[0];
        assert(n);
        const a = await actor(
          F,
          "update notifications set is_read=true where id=$1 returning id",
          [n.id],
        );
        const b = await actor(
          F,
          "update notifications set message='Forged' where id=$1",
          [n.id],
        );
        return a.rows.length === 1 && b.code === "42501";
      },
    );
    await test(
      "group unread tracking remains private",
      null,
      true,
      async () => {
        const t = (await actor(
          A,
          "select create_group_thread('Group',array[$1,$2]::uuid[]) id",
          [F, C],
        )).rows[0].id;
        await actor(
          A,
          "insert into dm_read_receipts(thread_id,user_id) values($1,$2)",
          [t, A],
        );
        return denied(
          await actor(
            F,
            "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
            [t, A],
          ),
        ) &&
          (await actor(
              A,
              "select last_read_at from dm_read_receipts where thread_id=$1 and user_id=$2",
              [t, A],
            )).rows.length === 1;
      },
    );
  }
  await db.close();
}
(async () => {
  await run(false);
  if (!process.argv.includes("--baseline-only")) await run(true);
  if (process.env.SPOTTED_BETA_RESULTS) fs.writeFileSync(process.env.SPOTTED_BETA_RESULTS, JSON.stringify(results, null, 2));
  console.log(`${total} beta privacy assertions passed`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
