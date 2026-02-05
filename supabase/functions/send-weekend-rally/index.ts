import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Send web push notification
async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; url: string; tag: string; type: string }
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured');
    return false;
  }

  try {
    const webpush = await import('https://esm.sh/web-push@3.6.7');
    
    webpush.default.setVapidDetails(
      'mailto:hello@spotted.app',
      vapidPublicKey,
      vapidPrivateKey
    );

    await webpush.default.sendNotification(
      subscription,
      JSON.stringify(payload)
    );
    
    console.log('Push sent successfully');
    return true;
  } catch (error) {
    console.error('Failed to send push:', error);
    return false;
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

    // SECURITY: Require admin authentication to prevent unauthorized mass notifications
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: hasAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !hasAdmin) {
      console.error('Admin role check failed:', roleError?.message || 'User is not admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} triggering weekend rally`);

    // Get all users with push enabled
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, push_enabled, push_subscription')
      .eq('push_enabled', true)
      .not('push_subscription', 'is', null);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('No users with push enabled');
      return new Response(
        JSON.stringify({ success: true, sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${profiles.length} users with push enabled`);

    const today = new Date().toISOString().split('T')[0];
    let sentCount = 0;
    const errors: string[] = [];

    const payload = {
      title: "What's the move this weekend? 🎉",
      body: 'See who\'s planning and make it happen',
      url: '/?rally=weekend',
      tag: `weekend-rally-${today}`,
      type: 'weekend_rally',
    };

    for (const profile of profiles) {
      try {
        const subscription = profile.push_subscription as PushSubscription;
        const success = await sendWebPush(subscription, payload);
        
        if (success) {
          sentCount++;
        }
      } catch (error) {
        console.error(`Failed to send to ${profile.id}:`, error);
        errors.push(profile.id);
      }
    }

    console.log(`Sent ${sentCount} weekend rally notifications, ${errors.length} failures`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        total: profiles.length,
        errors: errors.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-weekend-rally:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
