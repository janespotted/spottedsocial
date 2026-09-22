import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

// Cron only. No user JWT, request-supplied recipient or arbitrary URL accepted.
Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  if (
    req.method !== "POST" ||
    req.headers.get("Authorization") !== `Bearer ${key}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createClient(url, key);
  const { data: jobs, error } = await db.rpc("claim_push_batch");
  if (error) {
    return Response.json({ error: "Queue claim failed" }, { status: 500 });
  }
  const results = await Promise.all(
    (jobs ?? []).map(
      async (
        job: {
          notification_id: string;
          lease_id: string;
          channels: Record<string, boolean>;
        },
      ) => {
        let state = "pending",
          detail = "transport failure",
          channels = job.channels ?? {};
        try {
          const { data: n, error } = await db.from("notifications").select(
            "id,sender_id,receiver_id,type,message",
          ).eq("id", job.notification_id).maybeSingle();
          if (error) throw error;
          if (!n) {
            state = "skipped";
            detail = "deleted";
          } else {
            const response = await fetch(`${url}/functions/v1/send-push`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...n,
                notification_id: n.id,
                lease_id: job.lease_id,
              }),
              signal: AbortSignal.timeout(90_000),
            });
            const result = await response.json();
            channels = { ...channels, ...(result.channels ?? {}) };
            if (response.ok && result.success) {
              state = "sent";
              detail = "provider accepted";
            } else if (
              response.ok &&
              ["privacy_or_expiry", "receiver_not_found", "push_not_enabled"]
                .includes(result.reason)
            ) {
              state = "skipped";
              detail = result.reason;
            } else {detail = result.reason ??
                `provider failure (${response.status})`;}
            // Real schema fields only; no message bodies, tokens or addresses.
            const logged = await db.from("push_logs").insert({
              user_id: n.receiver_id,
              type: n.type,
              success: state === "sent",
              error: state === "sent" ? null : detail,
              payload: { notification_id: n.id, channels },
            });
            if (logged.error) {
              console.error("push_log_write_failed", logged.error.code);
            }
          }
        } catch {
          detail = "transport failure";
        }
        const { error: finishError } = await db.rpc("finish_push", {
          p_id: job.notification_id,
          p_lease: job.lease_id,
          p_state: state,
          p_error: detail,
          p_channels: channels,
        });
        if (finishError) console.error("push_finish_failed", finishError.code);
        return { id: job.notification_id, state, recorded: !finishError };
      },
    ),
  );
  return Response.json({ processed: results.length, results });
});
