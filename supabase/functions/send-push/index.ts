import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  'meetup_request',
  'venue_invite',
  'friend_request',
  'friend_accepted',
  'invite_accepted',
  'dm',
  'meetup_accepted',
  'venue_invite_accepted',
] as const;

// UUID v4 regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Input validation constants
const MAX_MESSAGE_LENGTH = 500;
const MAX_NOTIFICATION_ID_LENGTH = 100;

function validatePayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload format' };
  }

  const p = payload as Record<string, unknown>;

  // Validate notification_id
  if (typeof p.notification_id !== 'string' || p.notification_id.length === 0 || p.notification_id.length > MAX_NOTIFICATION_ID_LENGTH) {
    return { valid: false, error: 'Invalid notification_id' };
  }

  // Validate receiver_id is valid UUID
  if (typeof p.receiver_id !== 'string' || !UUID_REGEX.test(p.receiver_id)) {
    return { valid: false, error: 'Invalid receiver_id format' };
  }

  // Validate sender_id is valid UUID
  if (typeof p.sender_id !== 'string' || !UUID_REGEX.test(p.sender_id)) {
    return { valid: false, error: 'Invalid sender_id format' };
  }

  // Validate type is one of allowed values
  if (typeof p.type !== 'string' || !VALID_NOTIFICATION_TYPES.includes(p.type as typeof VALID_NOTIFICATION_TYPES[number])) {
    return { valid: false, error: `Invalid notification type. Must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}` };
  }

  // Validate message length
  if (typeof p.message !== 'string' || p.message.length === 0 || p.message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters` };
  }

  return { valid: true };
}

function validateSubscriptionEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    // Must be HTTPS and from a known push service
    return url.protocol === 'https:' && (
      url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.googleapis.com') ||
      url.hostname.endsWith('.mozilla.com') ||
      url.hostname.endsWith('.microsoft.com') ||
      url.hostname.endsWith('.windows.com') ||
      url.hostname.includes('push') // Generic fallback for other push services
    );
  } catch {
    return false;
  }
}

// Web Push requires signing with VAPID keys
async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string; type?: string }
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured');
    return false;
  }

  try {
    // Use web-push compatible endpoint
    // For production, you'd use a proper web-push library
    // This is a simplified version using the Push API directly
    
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Push failed:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('Push error:', err);
    return false;
  }
}

function getNotificationContent(type: string, message: string, _senderName?: string): { title: string; body: string; url: string } {
  switch (type) {
    case 'meetup_request':
      return {
        title: '🎉 Meet Up Request!',
        body: message,
        url: '/messages?tab=activity',
      };
    case 'venue_invite':
      return {
        title: '📍 Venue Invite!',
        body: message,
        url: '/messages?tab=activity',
      };
    case 'friend_request':
      return {
        title: '👋 Friend Request',
        body: message,
        url: '/profile/friend-requests',
      };
    case 'friend_accepted':
      return {
        title: '🎊 Friend Accepted!',
        body: message,
        url: '/messages',
      };
    case 'invite_accepted':
      return {
        title: '🎉 Invite Accepted!',
        body: message,
        url: '/profile',
      };
    case 'dm':
      return {
        title: `💬 New Message`,
        body: message,
        url: '/messages',
      };
    default:
      return {
        title: 'Spotted',
        body: message,
        url: '/',
      };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawPayload = await req.json();
    
    // Validate input payload structure and values
    const validation = validatePayload(rawPayload);
    if (!validation.valid) {
      console.error('Payload validation failed:', validation.error);
      return new Response(
        JSON.stringify({ error: `Bad Request: ${validation.error}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = rawPayload as PushPayload;
    console.log('Received push request:', { type: payload.type, receiver_id: payload.receiver_id });

    // SECURITY: Verify sender_id matches authenticated user to prevent impersonation
    if (payload.sender_id !== user.id) {
      console.error('Sender mismatch:', { payload_sender: payload.sender_id, auth_user: user.id });
      return new Response(
        JSON.stringify({ error: 'Forbidden: sender_id must match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { receiver_id, sender_id, type, message } = payload;

    // Get receiver's push subscription
    const { data: receiverProfile, error: profileError } = await supabase
      .from('profiles')
      .select('push_subscription, push_enabled, display_name')
      .eq('id', receiver_id)
      .single();

    if (profileError || !receiverProfile) {
      console.log('Receiver profile not found:', profileError);
      return new Response(
        JSON.stringify({ success: false, reason: 'receiver_not_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if push is enabled and subscription exists
    if (!receiverProfile.push_enabled || !receiverProfile.push_subscription) {
      console.log('Push not enabled or no subscription for user:', receiver_id);
      return new Response(
        JSON.stringify({ success: false, reason: 'push_not_enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get sender's name for personalized notifications
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', sender_id)
      .single();

    const senderName = senderProfile?.display_name || 'Someone';
    const subscription = receiverProfile.push_subscription as PushSubscription;

    // Validate subscription endpoint for security
    if (!subscription.endpoint || !validateSubscriptionEndpoint(subscription.endpoint)) {
      console.error('Invalid subscription endpoint:', subscription.endpoint);
      return new Response(
        JSON.stringify({ success: false, reason: 'invalid_subscription' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = getNotificationContent(type, message, senderName);

    // Send the push notification
    const success = await sendWebPush(subscription, {
      ...content,
      tag: `${type}-${payload.notification_id}`,
      type,
    });

    console.log('Push notification result:', { success, receiver_id, type });

    return new Response(
      JSON.stringify({ success }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in send-push function:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
