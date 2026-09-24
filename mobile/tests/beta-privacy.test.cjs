const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript");
function load(file, mocks) {
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../src", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", code)(
    (n) => {
      if (n in mocks) return mocks[n];
      throw Error("Missing " + n);
    },
    m,
    m.exports,
  );
  return m.exports;
}
const base = {
  "./profiles": {
    fetchProfilesSafe: async () => [],
    buildProfileMap: () => new Map(),
  },
  "./demo-mode": { isDemoMode: () => false },
  "./tonight": {
    nightResetAfterDate: () => new Date(),
    nightStartAt: () => new Date(0),
  },
  "./posts": { resolvePostImageUrl: async (x) => x },
  "./time-context": { isFromTonight: () => true },
};
test("native plan create/edit sends audience and participants in one server transaction", async () => {
  const calls = [];
  const api = load("lib/plans.ts", {
    ...base,
    "./supabase": {
      supabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: "plan-id", error: null };
        },
      },
    },
  });
  const values = {
    venue: { id: "venue-id" },
    planDate: "2026-10-01",
    planTime: "22:00",
    planType: "party",
    description: "  Private  ",
    visibility: "close_friends",
    friends: [{ id: "close-user" }],
  };
  assert.equal(await api.savePlan(null, values), "plan-id");
  assert.equal(await api.savePlan("plan-id", values), "plan-id");
  assert.equal(calls[0].name, "save_plan");
  assert.deepEqual(calls[0].args.p_participants, ["close-user"]);
  assert.equal(calls[0].args.p_values.visibility, "close_friends");
  assert.equal(calls[0].args.p_values.description, "Private");
  assert.equal(calls[1].args.p_id, "plan-id");
});
test("native plan save rejects unauthorized or failed saves instead of reporting success", async () => {
  const api = load("lib/plans.ts", {
    ...base,
    "./supabase": {
      supabase: {
        rpc: async () => ({ data: null, error: new Error("Audience denied") }),
      },
    },
  });
  await assert.rejects(
    api.savePlan(null, {
      venue: { id: "v" },
      planDate: "2026-10-01",
      planTime: "22:00",
      planType: null,
      description: "",
      visibility: "close_friends",
      friends: [],
    }),
    /Audience denied/,
  );
});
test("native plan delete targets exact source and leaves other notifications alone", async () => {
  const tables = [];
  const builder = {
    delete() {
      return this;
    },
    eq() {
      return this;
    },
    then(resolve) {
      resolve({ error: null });
    },
  };
  const api = load("lib/plans.ts", {
    ...base,
    "./supabase": {
      supabase: {
        from: (name) => {
          tables.push(name);
          return builder;
        },
      },
    },
  });
  await api.deletePlan("plan-id", "owner");
  assert.deepEqual(tables, ["plans"]);
});
test("peer receipts render only authorized server results and clear on denial or failure", async () => {
  let reply = { data: { last_read_at: "2026-09-24T22:00:00Z" }, error: null };
  const tables = [], filters = [];
  const builder = {
    select() {
      return this;
    },
    eq(k, v) {
      filters.push([k, v]);
      return this;
    },
    async maybeSingle() {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  const api = load("lib/dm.ts", {
    ...base,
    "./supabase": {
      supabase: {
        from: (name) => {
          tables.push(name);
          return builder;
        },
      },
    },
  });
  assert.equal(
    await api.fetchPeerReadReceipt("thread", "peer"),
    "2026-09-24T22:00:00Z",
  );
  reply = { data: null, error: null };
  assert.equal(await api.fetchPeerReadReceipt("thread", "peer"), null);
  reply = new Error("Offline");
  assert.equal(await api.fetchPeerReadReceipt("thread", "peer"), null);
  assert(tables.every((t) => t === "dm_read_receipts"));
  assert.deepEqual(filters.slice(0, 2), [["thread_id", "thread"], [
    "user_id",
    "peer",
  ]]);
});
function inboxHarness(result, profileFailure = false) {
  let options;
  const client = { invalidateQueries() {}, setQueryData() {} };
  const builder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gte() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve(result);
    },
  };
  const api = load("hooks/use-notifications.ts", {
    "react": { useEffect() {} },
    "react-native": { AppState: {} },
    "@tanstack/react-query": {
      useQuery: (o) => {
        options = o;
        return { data: [] };
      },
      useQueryClient: () => client,
    },
    "@/lib/resilient-channel": {},
    "@/lib/supabase": { supabase: { from: () => builder } },
    "@/lib/profiles": {
      fetchProfilesSafe: async () => {
        if (profileFailure) throw Error("Offline");
        return [];
      },
      buildProfileMap: () => new Map(),
    },
    "@/lib/tonight": { nightStartAt: () => new Date(0) },
    "@/lib/query-client": { queryClient: client },
    "@/lib/night-boundary": {},
    "./use-session": {
      useSession: () => ({ session: { user: { id: "viewer" } } }),
    },
  });
  api.useNotifications();
  return options;
}
test("Activity revalidation removes revoked rows and never falls back to stale private text", async () => {
  const allowed = inboxHarness({
    data: [{
      id: "n",
      sender_id: "sender",
      type: "friend_out",
      message: "Allowed",
      data: {},
      created_at: "2026-09-24",
      is_read: false,
    }],
    error: null,
  });
  assert.equal((await allowed.queryFn())[0].message, "Allowed");
  assert.deepEqual(await inboxHarness({ data: [], error: null }).queryFn(), []);
  assert.deepEqual(
    await inboxHarness({ data: null, error: { message: "Denied" } }).queryFn(),
    [],
  );
  assert.deepEqual(
    await inboxHarness({ data: [], error: null }, true).queryFn(),
    [],
  );
  assert.equal(allowed.refetchOnMount, "always");
});
test("native route surface excludes Yap and retains venues, plans and direct/group chat", () => {
  const root = path.join(__dirname, "../src");
  assert(!fs.existsSync(path.join(root, "app/yap-thread.tsx")));
  const layout = fs.readFileSync(path.join(root, "app/_layout.tsx"), "utf8");
  assert(!layout.includes('name="yap-thread"'));
  for (const route of ["venue", "thread", "create-plan", "edit-plan"]) {
    assert(layout.includes(`name="${route}"`));
  }
  const chat = fs.readFileSync(
    path.join(root, "app/(tabs)/(messages)/messages.tsx"),
    "utf8",
  );
  assert(!chat.includes("@/lib/yap"));
  assert(chat.includes("<PlansFeed"));
  assert(chat.includes("fetchDmThreads"));
});
