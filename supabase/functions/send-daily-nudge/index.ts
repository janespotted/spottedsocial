import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// APNs Push (mirrored from send-push)
// ============================================================================

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(arr.length);
  new Uint8Array(buffer).set(arr);
  return buffer;
}

function cleanPemKey(raw: string): string {
  let cleaned = raw
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (cleaned.length % 4)) % 4;
  cleaned += '='.repeat(padding);
  return cleaned;
}

async function createApnsJwt(keyId: string, teamId: string, authKeyRaw: string): Promise<string> {
  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const cleanedKey = cleanPemKey(authKeyRaw);
  const keyData = base64ToUint8Array(cleanedKey);

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(keyData),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureB64 = uint8ArrayToBase64(signatureBytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${unsignedToken}.${signatureB64}`;
}

function isValidApnsToken(token: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(token);
}

const TERMINAL_TOKEN_REASONS = ['BadDeviceToken', 'Unregistered', 'ExpiredToken'];
const LEGACY_BUNDLE_ID = 'com.spotted.app';
const APNS_AUTH_KEY_FALLBACK = 'MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgQstzz12h8+F/5b8pkLYRVq1gxfbNNqQNGYuTHOaVsNigCgYIKoZIzj0DAQehRANCAAQumzNEd7bSuV02R0XLHF8KLCjPZ3mHzbV+JKbT4hJ2Yh4J4wtZK56pU6rZ18Sk/JtA3h1F7YlOuWyh63pBVQAV';
const APNS_KEY_ID_FALLBACK = 'YLS4L5S8TN';

async function sendApnsPushToHost(
  deviceToken: string,
  notificationPayload: { title: string; body: string; url?: string; type?: string; tag?: string },
  apnsHost: string,
  jwt: string,
  bundleId: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const apnsPayload = {
    aps: {
      alert: { title: notificationPayload.title, body: notificationPayload.body },
      sound: 'default',
      badge: 1,
      'thread-id': notificationPayload.type || 'default',
    },
    url: notificationPayload.url,
    type: notificationPayload.type,
  };

  const response = await fetch(`https://${apnsHost}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let reason = 'unknown';
    try { reason = JSON.parse(errorText).reason || errorText; } catch { reason = errorText; }
    console.error(`APNs failed on ${apnsHost}: ${response.status} ${reason}`);
    return { ok: false, status: response.status, reason };
  }

  await response.text();
  return { ok: true, status: response.status };
}

async function sendApnsPush(
  deviceToken: string,
  notificationPayload: { title: string; body: string; url?: string; type?: string; tag?: string },
): Promise<{ success: boolean; terminalFailure: boolean }> {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');

  const envAuthKey = Deno.env.get('APNS_AUTH_KEY') || '';
  const authKey = envAuthKey.length >= 100 ? envAuthKey : APNS_AUTH_KEY_FALLBACK;
  const envKeyId = Deno.env.get('APNS_KEY_ID') || '';
  const keyId = envKeyId.length >= 8 ? envKeyId : APNS_KEY_ID_FALLBACK;

  if (!teamId || !bundleId) {
    console.log('APNs secrets not configured, skipping');
    return { success: false, terminalFailure: false };
  }

  if (!isValidApnsToken(deviceToken)) {
    return { success: false, terminalFailure: true };
  }

  try {
    const trimmedBundleId = bundleId.trim();
    const jwt = await createApnsJwt(keyId, teamId, authKey);

    const isSandbox = Deno.env.get('APNS_SANDBOX') === 'true';
    const primaryHost = isSandbox ? 'api.development.push.apple.com' : 'api.push.apple.com';
    const fallbackHost = isSandbox ? 'api.push.apple.com' : 'api.development.push.apple.com';

    const result = await sendApnsPushToHost(deviceToken, notificationPayload, primaryHost, jwt, trimmedBundleId);
    if (result.ok) return { success: true, terminalFailure: false };

    if (result.reason === 'BadEnvironmentKeyInToken') {
      const fallback = await sendApnsPushToHost(deviceToken, notificationPayload, fallbackHost, jwt, trimmedBundleId);
      if (fallback.ok) return { success: true, terminalFailure: false };

      if (trimmedBundleId !== LEGACY_BUNDLE_ID && (fallback.reason === 'BadDeviceToken' || fallback.reason === 'DeviceTokenNotForTopic')) {
        const legacyPrimary = await sendApnsPushToHost(deviceToken, notificationPayload, primaryHost, jwt, LEGACY_BUNDLE_ID);
        if (legacyPrimary.ok) return { success: true, terminalFailure: false };
        if (legacyPrimary.reason === 'BadEnvironmentKeyInToken') {
          const legacyFallback = await sendApnsPushToHost(deviceToken, notificationPayload, fallbackHost, jwt, LEGACY_BUNDLE_ID);
          if (legacyFallback.ok) return { success: true, terminalFailure: false };
        }
      }
    }

    if ((result.reason === 'DeviceTokenNotForTopic' || result.reason === 'BadDeviceToken') && trimmedBundleId !== LEGACY_BUNDLE_ID) {
      const legacyResult = await sendApnsPushToHost(deviceToken, notificationPayload, primaryHost, jwt, LEGACY_BUNDLE_ID);
      if (legacyResult.ok) return { success: true, terminalFailure: false };
      if (legacyResult.reason === 'BadEnvironmentKeyInToken') {
        const legacyFallback = await sendApnsPushToHost(deviceToken, notificationPayload, fallbackHost, jwt, LEGACY_BUNDLE_ID);
        if (legacyFallback.ok) return { success: true, terminalFailure: false };
      }
    }

    if (TERMINAL_TOKEN_REASONS.includes(result.reason || '')) {
      return { success: false, terminalFailure: true };
    }

    return { success: false, terminalFailure: true };
  } catch (err) {
    console.error('APNs push error:', err);
    return { success: false, terminalFailure: false };
  }
}

// ============================================================================
// Web Push (via web-push npm)
// ============================================================================

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url: string; tag: string; type: string },
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublicKey || !vapidPrivateKey) return false;

  try {
    const webpush = await import('https://esm.sh/web-push@3.6.7');
    webpush.default.setVapidDetails('mailto:hello@spotted.app', vapidPublicKey, vapidPrivateKey);
    await webpush.default.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Web push failed:', error);
    return false;
  }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate: accept service role key (for pg_cron) or admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      // Fall back to admin user check
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: hasAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!hasAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden: Admin role required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { nudge_number } = await req.json();

    if (nudge_number !== 1 && nudge_number !== 2) {
      return new Response(
        JSON.stringify({ error: 'Invalid nudge_number. Must be 1 or 2' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const today = new Date().toISOString().split('T')[0];
    console.log(`[NUDGE] Starting nudge_number=${nudge_number} for ${today}`);

    // Log to push_logs
    await supabase.from('push_logs').insert([{
      stage: 'nudge_start',
      detail: { nudge_number, date: today },
    }]);

    // 1. Get all users with push enabled and at least one push channel
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, push_enabled, push_subscription, apns_device_token')
      .eq('push_enabled', true);

    if (profilesError) throw profilesError;

    // Filter to users with at least one push channel
    const pushableProfiles = (profiles || []).filter(
      (p: any) => p.push_subscription || p.apns_device_token,
    );

    if (pushableProfiles.length === 0) {
      console.log('[NUDGE] No pushable users found');
      return new Response(
        JSON.stringify({ success: true, sent: 0, skipped_active: 0, skipped_nudged: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[NUDGE] ${pushableProfiles.length} pushable users`);
    const userIds = pushableProfiles.map((p: any) => p.id);

    // 2. Filter out users with active night_statuses (out, planning)
    const { data: activeStatuses } = await supabase
      .from('night_statuses')
      .select('user_id, status')
      .in('user_id', userIds)
      .in('status', ['out', 'planning'])
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    const activeUserIds = new Set((activeStatuses || []).map((s: any) => s.user_id));
    console.log(`[NUDGE] ${activeUserIds.size} users with active night status (skipped)`);

    // 3. Get existing nudge records for today
    const { data: existingNudges } = await supabase
      .from('daily_nudges')
      .select('user_id, first_nudge_sent_at, first_nudge_response, second_nudge_sent_at')
      .eq('nudge_date', today)
      .in('user_id', userIds);

    const nudgeMap = new Map((existingNudges || []).map((n: any) => [n.user_id, n]));

    // 4. Build recipient list
    let skippedActive = 0;
    let skippedNudged = 0;
    const recipients: any[] = [];

    for (const profile of pushableProfiles) {
      // Skip active users
      if (activeUserIds.has(profile.id)) {
        skippedActive++;
        continue;
      }

      const nudge = nudgeMap.get(profile.id);

      if (nudge_number === 1) {
        // Skip if already sent first nudge today
        if (nudge?.first_nudge_sent_at) {
          skippedNudged++;
          continue;
        }
      } else {
        // Nudge 2: only send if first was sent but user never engaged
        if (!nudge?.first_nudge_sent_at) {
          skippedNudged++;
          continue;
        }
        if (nudge.first_nudge_response !== null && nudge.first_nudge_response !== undefined) {
          skippedNudged++;
          continue;
        }
        if (nudge.second_nudge_sent_at) {
          skippedNudged++;
          continue;
        }
      }

      recipients.push(profile);
    }

    console.log(`[NUDGE] ${recipients.length} recipients (${skippedActive} active, ${skippedNudged} already nudged/engaged)`);

    // 5. Build notification payload
    const payload = nudge_number === 1
      ? {
          title: 'Spotted',
          body: 'Are you going out tonight? Let your friends know',
          url: '/?nudge=first',
          tag: `daily-nudge-first-${today}`,
          type: 'daily_nudge_first',
        }
      : {
          title: 'Spotted',
          body: 'So... are you going out? \u{1F440}',
          url: '/?nudge=second',
          tag: `daily-nudge-second-${today}`,
          type: 'daily_nudge_second',
        };

    // 6. Send to all recipients
    let sentCount = 0;
    let failCount = 0;

    for (const profile of recipients) {
      let sent = false;

      // Try APNs
      if (profile.apns_device_token) {
        try {
          const result = await sendApnsPush(profile.apns_device_token, payload);
          if (result.success) sent = true;

          // Clear dead tokens
          if (result.terminalFailure) {
            await supabase
              .from('profiles')
              .update({ apns_device_token: null })
              .eq('id', profile.id);
          }
        } catch (err) {
          console.error(`[NUDGE] APNs error for ${profile.id}:`, err);
        }
      }

      // Try Web Push
      if (profile.push_subscription) {
        try {
          const subscription = profile.push_subscription as PushSubscription;
          if (subscription.endpoint) {
            const webResult = await sendWebPush(subscription, payload);
            if (webResult) sent = true;
          }
        } catch (err) {
          console.error(`[NUDGE] Web push error for ${profile.id}:`, err);
        }
      }

      if (sent) {
        sentCount++;

        // Record in daily_nudges
        const upsertData: any = {
          user_id: profile.id,
          nudge_date: today,
        };
        if (nudge_number === 1) {
          upsertData.first_nudge_sent_at = new Date().toISOString();
        } else {
          upsertData.second_nudge_sent_at = new Date().toISOString();
        }

        await supabase.from('daily_nudges').upsert(upsertData, {
          onConflict: 'user_id,nudge_date',
        });
      } else {
        failCount++;
      }
    }

    console.log(`[NUDGE] Done: ${sentCount} sent, ${failCount} failed`);

    await supabase.from('push_logs').insert([{
      stage: 'nudge_complete',
      detail: {
        nudge_number,
        date: today,
        sent: sentCount,
        failed: failCount,
        skipped_active: skippedActive,
        skipped_nudged: skippedNudged,
        total_pushable: pushableProfiles.length,
      },
    }]);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        failed: failCount,
        skipped_active: skippedActive,
        skipped_nudged: skippedNudged,
        total_pushable: pushableProfiles.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[NUDGE] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
