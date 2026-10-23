/** No automatic retries: a lost HTTP reply can still mean the SMS was sent. */
export async function sendInvitation(job, config, fetcher = fetch) {
  const body = new URLSearchParams({
    To: job.to,
    Body: job.body,
    MessagingServiceSid: config.service,
    StatusCallback: `${config.callback}?message=${encodeURIComponent(job.id)}`,
  });
  try {
    const response = await fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${config.account}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(config.account + ":" + config.token)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    let data;
    try {
      data = await response.json();
    } catch {
      return { status: "unknown", error: "unreadable_provider_reply" };
    }
    if (!response.ok)
      return {
        status: response.status >= 500 ? "unknown" : "failed",
        error: String(data.code || response.status),
      };
    if (!/^SM[0-9a-f]{32}$/i.test(data.sid || ""))
      return { status: "unknown", error: "missing_provider_receipt" };
    return {
      status: deliveryState(data.status),
      sid: data.sid,
      error: data.error_code ? String(data.error_code) : null,
    };
  } catch {
    return { status: "unknown", error: "provider_outcome_unknown" };
  }
}
export function deliveryState(status) {
  return status === "delivered" || status === "read"
    ? "delivered"
    : status === "sent"
      ? "sent"
      : ["failed", "undelivered", "canceled"].includes(status)
        ? "failed"
        : "accepted";
}
export async function validTwilioSignature(url, form, signature, token) {
  if (!signature || !token || !url.startsWith("https://")) return false;
  const entries = [...form.entries()];
  if (new Set(entries.map(([k]) => k)).size !== entries.length) return false;
  const text =
    url +
    entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => k + v)
      .join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(text)),
  );
  const expected = btoa(String.fromCharCode(...bytes));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
