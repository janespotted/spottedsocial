export interface ContactMatch {
  phone: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}
export interface ContactDependencies {
  authenticate: (authorization: string) => Promise<boolean>;
  match: (
    authorization: string,
    phones: string[],
  ) => Promise<
    { data: ContactMatch[] | null; error: { code?: string } | null }
  >;
}
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
export async function handleContactMatch(
  req: Request,
  deps: ContactDependencies,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer \S+$/.test(authorization)) return reply({ error: "Unauthorized" }, 401);
  try {
    if (!await deps.authenticate(authorization)) return reply({ error: "Unauthorized" }, 401);
  } catch {
    return reply({ error: "Authentication unavailable" }, 503);
  }
  try {
    const reader = req.body?.getReader();
    let size = 0;
    let body = "";
    if (!reader) return reply({ error: "Missing body" }, 400);
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) {
        await reader.cancel();
        return reply({ error: "Request too large" }, 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const { phones } = JSON.parse(body);
    if (
      !Array.isArray(phones) || phones.length < 1 || phones.length > 500 ||
      phones.some((p) =>
        typeof p !== "string" || !/^\+?[1-9][0-9]{9,14}$/.test(p)
      )
    ) return reply({ error: "Expected 1 to 500 valid phone numbers" }, 400);
    const normalized = [...new Set(phones.map((p) => p.replace(/^\+/, "")))];
    const { data, error } = await deps.match(authorization, normalized);
    if (error) {
      return reply({
        error: error.code === "P0001"
          ? "Contact matching limit reached. Try again later."
          : "Contact matching unavailable",
      }, error.code === "P0001" ? 429 : error.code === "42501" ? 403 : 503);
    }
    const matches = data ?? [];
    const found = new Set(matches.map((m) => m.phone));
    return reply({
      matches,
      nonMatches: normalized.filter((p) => !found.has(p)),
    });
  } catch {
    return reply({ error: "Invalid contact request" }, 400);
  }
}
