import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { sendInvitation } from "../_shared/launch-sms.mjs";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!,
    auth = req.headers.get("Authorization") || "";
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: identity, error: authError } = await user.auth.getUser();
  if (authError || !identity.user) return json({ error: "Sign in first" }, 401);
  const { data: dashboard, error: roleError } = await user.rpc("launch_admin", {
    p_action: "snapshot",
    p_data: {},
  });
  if (roleError) return json({ error: "Admin access required" }, 403);
  const config = {
    account: Deno.env.get("LAUNCH_TWILIO_ACCOUNT_SID"),
    token: Deno.env.get("LAUNCH_TWILIO_AUTH_TOKEN"),
    service: Deno.env.get("LAUNCH_TWILIO_MESSAGING_SERVICE_SID"),
    callback: `${url}/functions/v1/launch-sms-callback`,
  };
  if (
    !dashboard.settings.smsEnabled ||
    Deno.env.get("LAUNCH_SMS_MODE") !== "live" ||
    !config.account ||
    !config.token ||
    !config.service
  )
    return json(
      {
        error:
          "Invitation SMS sender is not enabled. Use personal sharing until the sender is configured.",
      },
      503,
    );
  const service = createClient(
    url,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const totals = { processed: 0, accepted: 0, failed: 0, unknown: 0 };
  for (let i = 0; i < 10; i++) {
    const { data: job, error } = await service.rpc("launch_message_job", {
      p_action: "claim",
      p_data: {},
    });
    if (error)
      return json(
        { error: "Could not claim a queued message", ...totals },
        503,
      );
    if (!job) break;
    const result = await sendInvitation(job, config);
    const { error: saveError } = await service.rpc("launch_message_job", {
      p_action: "status",
      p_data: { id: job.id, ...result },
    });
    totals.processed++;
    if (saveError) {
      totals.unknown++;
      return json(
        {
          error:
            "Provider result could not be recorded. Check status before retrying.",
          ...totals,
        },
        503,
      );
    }
    if (result.status === "failed") totals.failed++;
    else if (result.status === "unknown") totals.unknown++;
    else totals.accepted++;
  }
  return json(totals);
});
