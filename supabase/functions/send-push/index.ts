import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  notification_id: string;
  receiver_id: string;
  sender_id: string;
  type: string;
  message: string;
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Valid notification types - must be one of these
const VALID_NOTIFICATION_TYPES = [
  "meetup_request",
  "venue_invite",
  "friend_request",
  "friend_accepted",
  "invite_accepted",
  "dm",
  "meetup_accepted",
  "venue_invite_accepted",
  "rally",
  "plan_down",
  "address_request",
  "private_party_invite",
  "venue_yap",
  "friend_checkin",
  "post_like",
  "post_comment",
] as const;

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Input validation constants
const MAX_MESSAGE_LENGTH = 500;
const MAX_NOTIFICATION_ID_LENGTH = 100;

/**
 * Sanitize message content by escaping HTML entities and removing potentially
 * dangerous characters. This prevents XSS if push notifications render HTML.
 */
function sanitizeMessage(message: string): string {
  return (
    message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      // Remove control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
  );
}

function validatePayload(payload: unknown): { valid: boolean; error?: string; sanitizedMessage?: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid payload format" };
  }

  const p = payload as Record<string, unknown>;

  // Validate notification_id
  if (
    typeof p.notification_id !== "string" ||
    p.notification_id.length === 0 ||
    p.notification_id.length > MAX_NOTIFICATION_ID_LENGTH
  ) {
    return { valid: false, error: "Invalid notification_id" };
  }

  // Validate receiver_id is valid UUID
  if (typeof p.receiver_id !== "string" || !UUID_REGEX.test(p.receiver_id)) {
    return { valid: false, error: "Invalid receiver_id format" };
  }

  // Validate sender_id is valid UUID
  if (typeof p.sender_id !== "string" || !UUID_REGEX.test(p.sender_id)) {
    return { valid: false, error: "Invalid sender_id format" };
  }

  // Validate type is one of allowed values
  if (
    typeof p.type !== "string" ||
    !VALID_NOTIFICATION_TYPES.includes(p.type as (typeof VALID_NOTIFICATION_TYPES)[number])
  ) {
    return { valid: false, error: `Invalid notification type. Must be one of: ${VALID_NOTIFICATION_TYPES.join(", ")}` };
  }

  // Validate message length
  if (typeof p.message !== "string" || p.message.length === 0 || p.message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters` };
  }

  // Sanitize message content to prevent XSS/injection
  const sanitizedMessage = sanitizeMessage(p.message);

  return { valid: true, sanitizedMessage };
}

function validateSubscriptionEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    // Must be HTTPS and from a known push service
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".googleapis.com") ||
        url.hostname.endsWith(".mozilla.com") ||
        url.hostname.endsWith(".microsoft.com") ||
        url.hostname.endsWith(".windows.com") ||
        url.hostname.includes("push")) // Generic fallback for other push services
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Web Push Encryption (RFC 8291) Implementation
// ============================================================================

// Convert URL-safe base64 to standard base64
function urlBase64ToBase64(urlBase64: string): string {
  let base64 = urlBase64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padding);
  return base64;
}

// Convert base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Uint8Array to ArrayBuffer (for crypto API compatibility)
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(arr.length);
  new Uint8Array(buffer).set(arr);
  return buffer;
}

// Create VAPID JWT for authorization
async function createVapidJwt(
  audience: string,
  subject: string,
  vapidPrivateKeyBase64: string,
  vapidPublicKeyBase64: string,
  expiration: number,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: expiration,
    sub: subject,
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key for signing
  const privateKeyBytes = base64ToUint8Array(urlBase64ToBase64(vapidPrivateKeyBase64));

  // Get public key bytes
  const publicKeyBytes = base64ToUint8Array(urlBase64ToBase64(vapidPublicKeyBase64));

  // Extract x and y from uncompressed public key (starts with 0x04)
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: uint8ArrayToBase64(x).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
    y: uint8ArrayToBase64(y).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
    d: uint8ArrayToBase64(privateKeyBytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
  };

  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  // Sign the token
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  // Convert signature to URL-safe base64
  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureB64 = uint8ArrayToBase64(signatureBytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${unsignedToken}.${signatureB64}`;
}

// HKDF for key derivation
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const saltBuffer = salt.length ? toArrayBuffer(salt) : new ArrayBuffer(32);
  const ikmBuffer = toArrayBuffer(ikm);

  const key = await crypto.subtle.importKey("raw", saltBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  const prkBuffer = await crypto.subtle.sign("HMAC", key, ikmBuffer);
  const prk = new Uint8Array(prkBuffer);

  const prkKey = await crypto.subtle.importKey("raw", toArrayBuffer(prk), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);

  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info);
  infoWithCounter[info.length] = 1;

  const outputBuffer = await crypto.subtle.sign("HMAC", prkKey, toArrayBuffer(infoWithCounter));
  const output = new Uint8Array(outputBuffer);
  return output.slice(0, length);
}

// Create info for HKDF
function createInfo(type: string, context: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const info = new Uint8Array(typeBytes.length + 1 + context.length);
  info.set(typeBytes);
  info[typeBytes.length] = 0;
  info.set(context, typeBytes.length + 1);
  return info;
}

// Encrypt payload using Web Push encryption (RFC 8291 / aes128gcm)
async function encryptPayload(
  payload: string,
  subscription: PushSubscription,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  // Generate ephemeral key pair for ECDH
  const localKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);

  // Export local public key in uncompressed format
  const localPublicKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPublicKey = new Uint8Array(localPublicKeyRaw);

  // Import subscriber's public key
  const p256dhBytes = base64ToUint8Array(urlBase64ToBase64(subscription.keys.p256dh));
  const subscriberPublicKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(p256dhBytes),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Derive shared secret via ECDH
  const sharedSecretBuffer = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberPublicKey },
    localKeyPair.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedSecretBuffer);

  // Get auth secret from subscription
  const authSecret = base64ToUint8Array(urlBase64ToBase64(subscription.keys.auth));

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Build key info
  const keyInfoData = new TextEncoder().encode("WebPush: info\0");
  const keyInfo = new Uint8Array(keyInfoData.length + 1 + 2 + p256dhBytes.length + 2 + localPublicKey.length);
  let offset = 0;
  keyInfo.set(keyInfoData, offset);
  offset += keyInfoData.length;
  keyInfo[offset++] = 0;
  keyInfo[offset++] = p256dhBytes.length;
  keyInfo.set(p256dhBytes, offset);
  offset += p256dhBytes.length;
  keyInfo[offset++] = 0;
  keyInfo[offset++] = localPublicKey.length;
  keyInfo.set(localPublicKey, offset);

  // Derive PRK from auth secret and shared secret
  const prk = await hkdf(authSecret, sharedSecret, new TextEncoder().encode("WebPush: info\0"), 32);

  // Derive content encryption key
  const cekInfo = createInfo("Content-Encoding: aes128gcm", new Uint8Array(0));
  const cek = await hkdf(salt, prk, cekInfo, 16);

  // Derive nonce
  const nonceInfo = createInfo("Content-Encoding: nonce", new Uint8Array(0));
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Import CEK for AES-GCM
  const aesKey = await crypto.subtle.importKey("raw", toArrayBuffer(cek), { name: "AES-GCM" }, false, ["encrypt"]);

  // Add padding delimiter (0x02) to payload
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Delimiter

  // Encrypt
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    aesKey,
    toArrayBuffer(paddedPayload),
  );

  return {
    ciphertext: new Uint8Array(encryptedBuffer),
    salt,
    localPublicKey,
  };
}

// Build aes128gcm body
function buildAes128GcmBody(salt: Uint8Array, localPublicKey: Uint8Array, ciphertext: Uint8Array): ArrayBuffer {
  // Header: salt (16) + rs (4) + idlen (1) + keyid (65 for P-256)
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKey.length);
  header.set(salt, 0);
  // Record size as big-endian uint32
  header[16] = (recordSize >> 24) & 0xff;
  header[17] = (recordSize >> 16) & 0xff;
  header[18] = (recordSize >> 8) & 0xff;
  header[19] = recordSize & 0xff;
  header[20] = localPublicKey.length;
  header.set(localPublicKey, 21);

  // Combine header and ciphertext
  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header);
  body.set(ciphertext, header.length);

  return toArrayBuffer(body);
}

// Send Web Push notification with proper VAPID and encryption
async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string; type?: string },
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID keys not configured");
    return false;
  }

  try {
    // Parse endpoint URL for audience
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

    // Create VAPID JWT (expires in 12 hours)
    const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const jwt = await createVapidJwt(
      audience,
      "mailto:support@spotted.app",
      vapidPrivateKey,
      vapidPublicKey,
      expiration,
    );

    // Encrypt the payload
    const payloadString = JSON.stringify(payload);
    const { ciphertext, salt, localPublicKey } = await encryptPayload(payloadString, subscription);

    // Build the encrypted body
    const body = buildAes128GcmBody(salt, localPublicKey, ciphertext);

    // Prepare VAPID public key for Crypto-Key header
    const vapidKeyBytes = base64ToUint8Array(urlBase64ToBase64(vapidPublicKey));
    const vapidKeyB64 = uint8ArrayToBase64(vapidKeyBytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    console.log("Sending web push to:", subscription.endpoint);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${vapidKeyB64}`,
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Web push failed:", response.status, errorText);

      // If subscription is gone, return false to trigger cleanup
      if (response.status === 404 || response.status === 410) {
        console.log("Subscription expired or invalid");
      }

      return false;
    }

    console.log("Web push sent successfully");
    return true;
  } catch (err) {
    console.error("Web push error:", err);
    return false;
  }
}

// ============================================================================
// APNs Push Notification Implementation
// ============================================================================

// Strip PEM headers/footers and whitespace from a .p8 key,
// returning pure base64 suitable for decoding.
function cleanPemKey(raw: string): string {
  let cleaned = raw
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  // Convert URL-safe base64 to standard base64
  cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padding = (4 - (cleaned.length % 4)) % 4;
  cleaned += "=".repeat(padding);
  return cleaned;
}

async function createApnsJwt(keyId: string, teamId: string, authKeyRaw: string): Promise<string> {
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Accept either raw .p8 file contents (with PEM headers) or bare base64
  const cleanedKey = cleanPemKey(authKeyRaw);
  console.log("APNs key length after cleaning:", cleanedKey.length, "chars");
  const keyData = base64ToUint8Array(cleanedKey);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(keyData),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signatureBytes = new Uint8Array(signatureBuffer);
  const signatureB64 = uint8ArrayToBase64(signatureBytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${unsignedToken}.${signatureB64}`;
}

// Validate APNs device token format (should be hex string, 64 chars for modern tokens)
function isValidApnsToken(token: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(token);
}

async function sendApnsPushToHost(
  deviceToken: string,
  notificationPayload: { title: string; body: string; url?: string; type?: string; tag?: string },
  apnsHost: string,
  jwt: string,
  bundleId: string,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const apnsPayload = {
    aps: {
      alert: {
        title: notificationPayload.title,
        body: notificationPayload.body,
      },
      sound: "default",
      badge: 1,
      "thread-id": notificationPayload.type || "default",
    },
    url: notificationPayload.url,
    type: notificationPayload.type,
  };

  console.log(`APNs attempt → host: ${apnsHost}, token: ${deviceToken.substring(0, 8)}…, topic: ${bundleId}`);

  const response = await fetch(`https://${apnsHost}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(apnsPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let reason = "unknown";
    try {
      reason = JSON.parse(errorText).reason || errorText;
    } catch {
      reason = errorText;
    }
    console.error(`APNs failed on ${apnsHost}: ${response.status} ${reason}`);
    return { ok: false, status: response.status, reason };
  }

  await response.text();
  console.log(`APNs push sent successfully via ${apnsHost}`);
  return { ok: true, status: response.status };
}

async function sendApnsPush(
  deviceToken: string,
  notificationPayload: { title: string; body: string; url?: string; type?: string; tag?: string },
): Promise<boolean> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const authKey = Deno.env.get("APNS_AUTH_KEY");
  const bundleId = Deno.env.get("APNS_BUNDLE_ID");

  if (!keyId || !teamId || !authKey || !bundleId) {
    console.log("APNs secrets not configured, skipping APNs push");
    return false;
  }

  // Validate token format
  if (!isValidApnsToken(deviceToken)) {
    console.error(`APNs token has invalid format (length=${deviceToken.length}, sample=${deviceToken.substring(0, 12)}…). Expected 64 hex chars.`);
    return false;
  }

  try {
    console.log("APNs config:", { keyId, teamId, bundleId: bundleId.trim(), tokenPrefix: deviceToken.substring(0, 8) });
    const jwt = await createApnsJwt(keyId, teamId, authKey);
    console.log("APNs JWT created successfully, length:", jwt.length);

    const isSandbox = Deno.env.get("APNS_SANDBOX") === "true";
    const primaryHost = isSandbox ? "api.development.push.apple.com" : "api.push.apple.com";
    const fallbackHost = isSandbox ? "api.push.apple.com" : "api.development.push.apple.com";

    // Try primary environment first
    const result = await sendApnsPushToHost(deviceToken, notificationPayload, primaryHost, jwt, bundleId.trim());

    if (result.ok) return true;

    // If BadEnvironmentKeyInToken, retry on the opposite host
    if (result.reason === "BadEnvironmentKeyInToken") {
      console.log(`BadEnvironmentKeyInToken on ${primaryHost}, retrying on fallback ${fallbackHost}…`);
      const fallbackResult = await sendApnsPushToHost(deviceToken, notificationPayload, fallbackHost, jwt, bundleId.trim());
      if (fallbackResult.ok) {
        console.log(`APNs push succeeded on fallback host ${fallbackHost}. Token is registered for ${isSandbox ? "production" : "sandbox"} environment.`);
        return true;
      }
      console.error(`APNs push also failed on fallback: ${fallbackResult.status} ${fallbackResult.reason}`);
    }

    // Terminal token errors — mark for cleanup
    const terminalReasons = ["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"];
    if (result.status === 410 || terminalReasons.includes(result.reason || "")) {
      console.log(`APNs terminal error (${result.reason || result.status}), clearing stale token`);
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const cleanupClient = createClient(supabaseUrl, supabaseServiceKey);
        await cleanupClient
          .from("profiles")
          .update({ apns_device_token: null, push_enabled: false })
          .eq("apns_device_token", deviceToken);
        console.log("Cleared stale APNs token from profile");
      } catch (cleanupErr) {
        console.error("Failed to clear stale APNs token:", cleanupErr);
      }
    }

    return false;
  } catch (err) {
    console.error("APNs push error:", err);
    return false;
  }
}

// ============================================================================
// Notification Content
// ============================================================================

function getNotificationContent(
  type: string,
  message: string,
  _senderName?: string,
): { title: string; body: string; url: string } {
  switch (type) {
    case "meetup_request":
      return { title: "🎉 Meet Up Request!", body: message, url: "/messages?tab=activity" };
    case "venue_invite":
      return { title: "📍 Venue Invite!", body: message, url: "/messages?tab=activity" };
    case "friend_request":
      return { title: "👋 Friend Request", body: message, url: "/profile/friend-requests" };
    case "friend_accepted":
      return { title: "🎊 Friend Accepted!", body: message, url: "/messages" };
    case "invite_accepted":
      return { title: "🎉 Invite Accepted!", body: message, url: "/profile" };
    case "dm":
      return { title: _senderName ? `💬 ${_senderName}` : "💬 New Message", body: message, url: "/messages" };
    case "meetup_accepted":
      return { title: "🎉 Meet Up Accepted!", body: message, url: "/messages?tab=activity" };
    case "venue_invite_accepted":
      return { title: "📍 Invite Accepted!", body: message, url: "/messages?tab=activity" };
    case "friend_checkin":
      return { title: "📍 Friend Checked In", body: message, url: "/" };
    case "post_like":
      return { title: "❤️ Post Liked", body: message, url: "/feed" };
    case "post_comment":
      return { title: "💬 New Comment", body: message, url: "/feed" };
    default:
      return { title: "Spotted", body: message, url: "/" };
  }
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawPayload = await req.json();
    const validation = validatePayload(rawPayload);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: `Bad Request: ${validation.error}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = rawPayload as PushPayload;

    // Verify sender matches authenticated user
    if (payload.sender_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden: sender_id must match authenticated user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { receiver_id, sender_id, type } = payload;
    const message = validation.sanitizedMessage!;

    // Get receiver's push subscription AND apns token
    const { data: receiverProfile, error: profileError } = await supabase
      .from("profiles")
      .select("push_subscription, push_enabled, display_name, apns_device_token")
      .eq("id", receiver_id)
      .single();

    if (profileError || !receiverProfile) {
      return new Response(JSON.stringify({ success: false, reason: "receiver_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if push is enabled and at least one channel exists
    const hasWebPush = !!receiverProfile.push_subscription;
    const hasApns = !!receiverProfile.apns_device_token;

    if (!receiverProfile.push_enabled || (!hasWebPush && !hasApns)) {
      console.log("Push not enabled or no subscription/token for user:", receiver_id);
      return new Response(JSON.stringify({ success: false, reason: "push_not_enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender's name
    const { data: senderProfile } = await supabase.from("profiles").select("display_name").eq("id", sender_id).single();

    const senderName = senderProfile?.display_name || "Someone";
    const content = getNotificationContent(type, message, senderName);
    const notificationPayload = {
      ...content,
      tag: `${type}-${payload.notification_id}`,
      type,
    };

    const results: { web?: boolean; apns?: boolean } = {};

    // Send via Web Push if subscription exists
    if (hasWebPush) {
      const subscription = receiverProfile.push_subscription as PushSubscription;
      if (subscription.endpoint && validateSubscriptionEndpoint(subscription.endpoint)) {
        results.web = await sendWebPush(subscription, notificationPayload);
      } else {
        console.error("Invalid web push subscription endpoint");
        results.web = false;
      }
    }

    // Send via APNs if device token exists
    if (hasApns) {
      results.apns = await sendApnsPush(receiverProfile.apns_device_token as string, notificationPayload);

      // Token hygiene: clear stale APNs token on terminal failures
      if (results.apns === false) {
        // Re-check the last error reason from logs isn't sufficient,
        // so we pass receiver_id into cleanup logic below
        console.log("APNs push failed for receiver:", receiver_id, "— will check for stale token cleanup");
      }
    }

    const success = results.web === true || results.apns === true;
    console.log("Push notification results:", { receiver_id, type, ...results });

    return new Response(JSON.stringify({ success, channels: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in send-push function:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
