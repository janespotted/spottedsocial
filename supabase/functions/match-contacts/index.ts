import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { handleContactMatch } from "../_shared/contact-matching.ts";

// Caller JWT reaches the database: direct RPC and Edge requests share limits.
// No service-role client or auth.users REST fallback is exposed here.
const client = (authorization: string) =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
Deno.serve((req) =>
  handleContactMatch(req, {
    authenticate: async (authorization) => {
      const { data, error } = await client(authorization).auth.getUser(
        authorization.slice(7),
      );
      return !error && !!data.user && !data.user.is_anonymous;
    },
    match: async (authorization, phones) => {
      const { data, error } = await client(authorization).rpc(
        "match_contacts",
        { p_phones: phones },
      );
      return { data, error };
    },
  })
);
