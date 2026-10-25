import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  sendInvitation,
  validTwilioSignature,
  deliveryState,
} from "../../supabase/functions/_shared/launch-sms.mjs";
const job = {
  id: "00000000-0000-4000-8000-000000000001",
  to: "+12025550101",
  body: "Spotted test invitation",
};
const config = {
  account: "AC" + "a".repeat(32),
  token: "fixture-only",
  service: "MG" + "b".repeat(32),
  callback: "https://example.test/functions/v1/launch-sms-callback",
};
test("Submission contains a receipt callback and returns acceptance, not delivery", async () => {
  let call;
  const result = await sendInvitation(job, config, async (url, init) => {
    call = { url, init };
    return Response.json({ sid: "SM" + "c".repeat(32), status: "queued" });
  });
  assert.equal(result.status, "accepted");
  assert.equal(call.init.body.get("To"), job.to);
  assert.equal(
    call.init.body.get("StatusCallback"),
    config.callback + "?message=" + job.id,
  );
});
test("Ambiguous timeouts and 5xx never automatically retry or report sent", async () => {
  for (const response of [
    async () => {
      throw Error("timeout");
    },
    async () => Response.json({ code: 20500 }, { status: 503 }),
    async () => new Response("oops"),
    async () => Response.json({ status: "queued" }),
  ]) {
    let calls = 0;
    const r = await sendInvitation(job, config, async (...args) => {
      calls++;
      return response(...args);
    });
    assert.equal(r.status, "unknown");
    assert.equal(calls, 1);
  }
});
test("Definite provider rejection is a failure", async () => {
  const r = await sendInvitation(job, config, async () =>
    Response.json({ code: 21610 }, { status: 400 }),
  );
  assert.equal(r.status, "failed");
  assert.equal(r.error, "21610");
});
test("Callback signature binds URL, query, all fields, and token", async () => {
  const url = config.callback + "?message=" + job.id,
    form = new URLSearchParams({
      MessageSid: "SMabc",
      MessageStatus: "delivered",
      AccountSid: config.account,
    });
  const sign = (body) =>
    createHmac("sha1", config.token)
      .update(
        url +
          [...body.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => k + v)
            .join(""),
      )
      .digest("base64");
  const signature = sign(form);
  assert.equal(
    await validTwilioSignature(url, form, signature, config.token),
    true,
  );
  for (const changed of [url + "x", url.replace("https", "http")])
    assert.equal(
      await validTwilioSignature(changed, form, signature, config.token),
      false,
    );
  form.set("MessageStatus", "failed");
  assert.equal(
    await validTwilioSignature(url, form, signature, config.token),
    false,
  );
  assert.equal(await validTwilioSignature(url, form, "", config.token), false);
});
test("Delivery and failure states are not confused with acceptance", () => {
  assert.equal(deliveryState("delivered"), "delivered");
  assert.equal(deliveryState("undelivered"), "failed");
  assert.equal(deliveryState("sent"), "sent");
  assert.equal(deliveryState("queued"), "accepted");
});
