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

    const { nudge_type } = await req.json();
    
    if (!nudge_type || !['first', 'second'].includes(nudge_type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid nudge_type. Must be "first" or "second"' }),
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

      // Prepare notification payload
      const payload = {
        title: nudge_type === 'first' 
          ? 'Are you going out tonight? 👀' 
          : 'Still going out tonight? ✨',
        body: nudge_type === 'first'
          ? 'Let your friends know if you\'re planning something'
          : 'Your friends are waiting to hear from you',
        url: `/?nudge=${nudge_type}`,
        tag: `daily-nudge-${nudge_type}-${today}`,
        type: `daily_nudge_${nudge_type}`,
      };

      try {
        const subscription = profile.push_subscription as PushSubscription;
        const success = await sendWebPush(subscription, payload);
        
        if (success) {
          sentCount++;
          
          // Record that we sent the nudge
          await supabase.from('daily_nudges').upsert({
            user_id: profile.id,
            nudge_date: today,
            ...(nudge_type === 'first' 
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
