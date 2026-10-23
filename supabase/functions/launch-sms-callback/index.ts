import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";
import { validTwilioSignature, deliveryState } from "../_shared/launch-sms.mjs";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const base = Deno.env.get("SUPABASE_URL")!,
    token = Deno.env.get("LAUNCH_TWILIO_AUTH_TOKEN");
  const parsed = new URL(req.url),
    query = parsed.search;
  const canonical = `${base}/functions/v1/launch-sms-callback${query}`;
  if (Number(req.headers.get("content-length") || 0) > 16384)
    return new Response("Too large", { status: 413 });
  const text = await req.text();
  if (text.length > 16384) return new Response("Too large", { status: 413 });
  const form = new URLSearchParams(text);
  if (
    !(await validTwilioSignature(
      canonical,
      form,
      req.headers.get("X-Twilio-Signature"),
      token,
    )) ||
    form.get("AccountSid") !== Deno.env.get("LAUNCH_TWILIO_ACCOUNT_SID")
  )
    return new Response("Invalid signature", { status: 403 });
  const service = createClient(
    base,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  if (
    form.get("OptOutType") === "STOP" ||
    /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(
      form.get("Body") || "",
    )
  ) {
    const { error } = await service.rpc("launch_message_job", {
      p_action: "stop",
      p_data: { phone: form.get("From") },
    });
    if (error) return new Response("Could not record opt out", { status: 503 });
  } else if (parsed.searchParams.get("message")) {
    const id = parsed.searchParams.get("message");
    if (!/^[0-9a-f-]{36}$/i.test(id!))
      return new Response("Invalid message", { status: 400 });
    const { error } = await service.rpc("launch_message_job", {
      p_action: "status",
      p_data: {
        id,
        sid: form.get("MessageSid"),
        status: deliveryState(form.get("MessageStatus")),
        error: form.get("ErrorCode"),
      },
    });
    if (error)
      return new Response("Could not record delivery", { status: 503 });
  }
  return new Response("<Response/>", {
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
});
