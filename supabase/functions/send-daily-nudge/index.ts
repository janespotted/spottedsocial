import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
// Compatibility endpoint: all campaigns now use the same city-local, deduped
// scheduler and queue. This endpoint cannot bypass quiet hours or opt-outs.
Deno.serve(async (req) => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, key);
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer /,
    "",
  );
  if (token !== key) {
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user) return new Response("Unauthorized", { status: 401 });
    const { data: admin, error: roleError } = await db.rpc("has_role", {
      user_id: user.id,
      role: "admin",
    });
    if (roleError || !admin) return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const { data, error } = await db.rpc("enqueue_scheduled_pushes");
  return Response.json(
    error ? { error: "Scheduler failed" } : { queued: data },
    { status: error ? 500 : 200 },
  );
});
