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
    // Import web-push for Deno
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

    // Check if user has admin role using the has_role function
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

    console.log(`Admin ${user.id} triggering daily nudge`);

    const { nudge_type } = await req.json();
    
    if (!nudge_type || !['first', 'second', 'day'].includes(nudge_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid nudge_type. Must be "first", "second", or "day"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    console.log(`Processing ${nudge_type} nudge for ${today}`);

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

    // Get existing nudge records for today
    const { data: existingNudges, error: nudgesError } = await supabase
      .from('daily_nudges')
      .select('user_id, first_nudge_response, second_nudge_response')
      .eq('nudge_date', today);

    if (nudgesError) {
      console.error('Error fetching nudges:', nudgesError);
      throw nudgesError;
    }

    const nudgeMap = new Map(existingNudges?.map(n => [n.user_id, n]) || []);
    
    let sentCount = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      const existingNudge = nudgeMap.get(profile.id);
      
      // Day nudge: skip if already responded to first nudge today
      if (nudge_type === 'day' && existingNudge?.first_nudge_response) {
        console.log(`Skipping ${profile.id} - already responded to first nudge`);
        continue;
      }
      
      // First nudge: skip if already responded
      if (nudge_type === 'first' && existingNudge?.first_nudge_response) {
        console.log(`Skipping ${profile.id} - already responded to first nudge`);
        continue;
      }
      
      // Second nudge: only send to those who said "going_out" or "maybe"
      if (nudge_type === 'second') {
        if (!existingNudge?.first_nudge_response) {
          console.log(`Skipping ${profile.id} - no first nudge response`);
          continue;
        }
        if (!['going_out', 'maybe'].includes(existingNudge.first_nudge_response)) {
          console.log(`Skipping ${profile.id} - first response was staying_in`);
          continue;
        }
        if (existingNudge.second_nudge_response) {
          console.log(`Skipping ${profile.id} - already responded to second nudge`);
          continue;
        }
      }

      // Prepare notification payload based on nudge type
      let payload;
      if (nudge_type === 'day') {
        payload = {
          title: 'Anyone doing something today? 🌞',
          body: 'It\'s a beautiful day for a day party',
          url: `/?nudge=day`,
          tag: `daily-nudge-day-${today}`,
          type: 'daily_nudge_day',
        };
      } else if (nudge_type === 'first') {
        payload = {
          title: 'Are you going out tonight? 👀',
          body: 'Let your friends know if you\'re planning something',
          url: `/?nudge=first`,
          tag: `daily-nudge-first-${today}`,
          type: 'daily_nudge_first',
        };
      } else {
        payload = {
          title: 'Still going out tonight? ✨',
          body: 'Your friends are waiting to hear from you',
          url: `/?nudge=second`,
          tag: `daily-nudge-second-${today}`,
          type: 'daily_nudge_second',
        };
      }

      try {
        const subscription = profile.push_subscription as PushSubscription;
        const success = await sendWebPush(subscription, payload);
        
        if (success) {
          sentCount++;
          
          // Record that we sent the nudge (day nudge counts as first nudge sent)
          await supabase.from('daily_nudges').upsert({
            user_id: profile.id,
            nudge_date: today,
            ...(nudge_type === 'day' || nudge_type === 'first' 
              ? { first_nudge_sent_at: new Date().toISOString() }
              : { second_nudge_sent_at: new Date().toISOString() }
            ),
          }, { onConflict: 'user_id,nudge_date' });
        }
      } catch (error) {
        console.error(`Failed to send to ${profile.id}:`, error);
        errors.push(profile.id);
      }
    }

    console.log(`Sent ${sentCount} ${nudge_type} nudges, ${errors.length} failures`);

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
    console.error('Error in send-daily-nudge:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
