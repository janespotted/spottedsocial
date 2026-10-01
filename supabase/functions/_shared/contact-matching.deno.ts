import {
  type ContactDependencies,
  handleContactMatch,
} from "./contact-matching.ts";
const assert = (ok: unknown) => {
  if (!ok) throw Error("Assertion failed");
};
const request = (phones: unknown, token = "valid") =>
  new Request("https://synthetic.invalid", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ phones }),
  });
function fixture() {
  let calls = 0;
  let submitted: string[] = [];
  const deps: ContactDependencies = {
    authenticate: async (token) => token === "Bearer valid",
    match: async (_token, phones) => {
      calls++;
      submitted = phones;
      return {
        data: [{
          phone: phones[0],
          user_id: "synthetic",
          display_name: "Synthetic",
          username: "synthetic",
          avatar_url: null,
        }],
        error: null,
      };
    },
  };
  return { deps, calls: () => calls, submitted: () => submitted };
}
Deno.test("anonymous and invalid sessions never invoke matching", async () => {
  const h = fixture();
  for (const token of ["", "invalid"]) {
    assert(
      (await handleContactMatch(request(["15550000001"], token), h.deps))
        .status === 401,
    );
  }
  assert(h.calls() === 0);
});
Deno.test("valid contacts normalize and deduplicate without caching private identity", async () => {
  const h = fixture();
  const r = await handleContactMatch(
    request(["+15550000001", "15550000001", "15550000002"]),
    h.deps,
  );
  const data = await r.json();
  assert(
    r.status === 200 && h.submitted().length === 2 &&
      data.matches.length === 1 && data.nonMatches[0] === "15550000002",
  );
  assert(r.headers.get("cache-control") === "no-store");
});
Deno.test("bad formats, nonstrings and oversized batches are rejected", async () => {
  const h = fixture();
  for (const phones of [[], ["bad"], [123], Array(501).fill("15550000001")]) {
    assert((await handleContactMatch(request(phones), h.deps)).status === 400);
  }
  assert(h.calls() === 0);
});
Deno.test("body streaming is bounded even without Content-Length", async () => {
  const h = fixture();
  assert(
    (await handleContactMatch(request(["1".repeat(20000)]), h.deps)).status ===
      413,
  );
  assert(h.calls() === 0);
});
Deno.test("database rate rejection propagates as 429 with no identity payload", async () => {
  const h = fixture();
  h.deps.match = async () => ({ data: null, error: { code: "P0001" } });
  const r = await handleContactMatch(request(["15550000001"]), h.deps);
  assert(r.status === 429 && !(await r.text()).includes("15550000001"));
});
Deno.test("SQL permission denial and backend errors fail closed", async () => {
  for (const code of ["42501", "XX000"]) {
    const h = fixture();
    h.deps.match = async () => ({ data: null, error: { code } });
    const r = await handleContactMatch(request(["15550000001"]), h.deps);
    assert(r.status >= 400 && !(await r.text()).includes("matches"));
  }
});

Deno.test("Auth transport failure never falls through to contact matching", async () => {
  const h = fixture();
  h.deps.authenticate = async () => { throw Error("Auth unavailable"); };
  const r = await handleContactMatch(request(["15550000001"]), h.deps);
  assert(r.status === 503 && h.calls() === 0);
});
