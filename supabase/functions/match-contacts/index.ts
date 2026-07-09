import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Match phone numbers from the user's contact book against existing Spotted users.
 *
 * Input:  { phones: ["+19145551234", "+12125559999", ...] }
 *   - E.164 formatted phone numbers (stripped/normalized by the client)
 *   - Max 500 per request
 *
 * Output: { matches: [{ phone, user_id, display_name, username, avatar_url }], nonMatches: ["+12125559999", ...] }
 *   - matches: contacts who are already Spotted users (with profile info)
 *   - nonMatches: phone numbers not on Spotted (for invite flow)
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers });
    }

    const token = authHeader.replace('Bearer ', '');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const { phones } = await req.json();

    if (!Array.isArray(phones) || phones.length === 0) {
      return new Response(JSON.stringify({ matches: [], nonMatches: [] }), { headers });
    }

    // Limit to 500 per request
    const phoneList = phones.slice(0, 500) as string[];

    // Normalize: strip everything except digits, ensure no leading +
    const normalizedPhones = phoneList
      .map((p: string) => p.replace(/[^\d]/g, ''))
      .filter((p: string) => p.length >= 10);

    if (normalizedPhones.length === 0) {
      return new Response(JSON.stringify({ matches: [], nonMatches: phoneList }), { headers });
    }

    // Use service role to query auth.users (phone column)
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // auth.users stores phone without '+' (e.g., "19144142407")
    // Query in batches of 100 to stay within PostgREST limits
    const allMatches: { phone: string; user_id: string; display_name: string; username: string; avatar_url: string | null }[] = [];
    const matchedPhones = new Set<string>();

    for (let i = 0; i < normalizedPhones.length; i += 100) {
      const batch = normalizedPhones.slice(i, i + 100);

      // Find auth users with matching phone numbers
      const { data: authUsers } = await sb
        .from('auth.users' as any)
        .select('id, phone')
        .in('phone', batch);

      // Fallback: direct SQL query since auth.users might not be queryable via PostgREST
      if (!authUsers) {
        const phoneValues = batch.map(p => `'${p}'`).join(',');
        const { data: sqlUsers } = await sb.rpc('match_phones' as any, { phone_list: batch });

        if (sqlUsers) {
          for (const u of sqlUsers) {
            if (u.user_id === user.id) continue; // Skip self
            matchedPhones.add(u.phone);
            allMatches.push(u);
          }
        }
        continue;
      }

      // Get profiles for matched auth users
      const matchedUserIds = (authUsers as any[])
        .filter((u: any) => u.id !== user.id) // Skip self
        .map((u: any) => ({ id: u.id, phone: u.phone }));

      if (matchedUserIds.length > 0) {
        const { data: profiles } = await sb
          .from('profiles')
          .select('id, display_name, username, avatar_url')
          .in('id', matchedUserIds.map((u: any) => u.id))
          .eq('is_demo', false);

        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

        for (const mu of matchedUserIds) {
          const profile = profileMap.get(mu.id);
          if (profile) {
            matchedPhones.add(mu.phone);
            allMatches.push({
              phone: mu.phone,
              user_id: profile.id,
              display_name: profile.display_name,
              username: profile.username,
              avatar_url: profile.avatar_url,
            });
          }
        }
      }
    }

    // nonMatches = phones that didn't match any user
    const nonMatches = normalizedPhones.filter(p => !matchedPhones.has(p));

    return new Response(JSON.stringify({
      matches: allMatches,
      nonMatches,
    }), { headers });

  } catch (e) {
    console.error('match-contacts error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
});
