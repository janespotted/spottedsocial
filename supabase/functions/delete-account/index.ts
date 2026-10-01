import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteMuxAssets, muxConfigured } from '../_shared/mux.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token for identity verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user with anon key
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      console.log('❌ User verification failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`🗑️ Starting account deletion for user: ${userId}`);

    // Create admin client for deletion operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Delete user data from all tables in order
    const deletionOrder = [
      // Delete likes and votes first (references posts/yaps)
      { table: 'post_likes', column: 'user_id' },
      { table: 'post_comment_likes', column: 'user_id' },
      { table: 'post_comments', column: 'user_id' },
      { table: 'yap_votes', column: 'user_id' },
      { table: 'yap_comment_votes', column: 'user_id' },
      { table: 'yap_comments', column: 'user_id' },
      { table: 'review_votes', column: 'user_id' },
      
      // Delete content
      { table: 'posts', column: 'user_id' },
      { table: 'yap_messages', column: 'user_id' },
      { table: 'stories', column: 'user_id' },
      { table: 'story_views', column: 'user_id' },
      
      // Delete plans and related
      { table: 'plan_votes', column: 'user_id' },
      { table: 'plan_downs', column: 'user_id' },
      { table: 'plan_participants', column: 'user_id' },
      { table: 'plan_comments', column: 'user_id' },
      { table: 'plans', column: 'user_id' },
      
      // Delete events related
      { table: 'event_rsvps', column: 'user_id' },
      
      // Delete location data
      { table: 'checkins', column: 'user_id' },
      { table: 'night_statuses', column: 'user_id' },
      { table: 'location_detection_logs', column: 'user_id' },
      { table: 'venue_location_reports', column: 'user_id' },
      
      // Delete social connections
      { table: 'friendships', column: 'user_id' },
      { table: 'friendships', column: 'friend_id' },
      { table: 'close_friends', column: 'user_id' },
      { table: 'close_friends', column: 'close_friend_id' },
      
      // Delete location hiding (FK cascade added in WP6, but explicit for safety)
      { table: 'location_hidden', column: 'user_id' },
      { table: 'location_hidden', column: 'hidden_from_id' },

      // Delete messages (typing indicators are Presence-only — nothing stored)
      { table: 'dm_messages', column: 'sender_id' },
      { table: 'dm_read_receipts', column: 'user_id' },
      { table: 'dm_thread_members', column: 'user_id' },
      
      // Delete notifications
      { table: 'notifications', column: 'sender_id' },
      { table: 'notifications', column: 'receiver_id' },
      
      // Delete reports and blocks
      { table: 'reports', column: 'reporter_id' },
      { table: 'blocked_users', column: 'blocker_id' },
      { table: 'blocked_users', column: 'blocked_id' },
      
      // Delete nudges and rate limits
      { table: 'daily_nudges', column: 'user_id' },
      { table: 'rate_limit_actions', column: 'user_id' },
      { table: 'event_logs', column: 'user_id' },
      
      // Delete invites
      { table: 'invite_uses', column: 'inviter_id' },
      { table: 'invite_uses', column: 'invited_user_id' },
      { table: 'invite_codes', column: 'user_id' },
      
      // Delete wishlist
      { table: 'wishlist_places', column: 'user_id' },
      
      // Delete profile last
      { table: 'profiles', column: 'id' },
    ];

    // Video posts live on Mux — drop the assets before the rows go.
    {
      const { data: videoPosts } = await supabaseAdmin
        .from('posts')
        .select('mux_asset_id')
        .eq('user_id', userId)
        .not('mux_asset_id', 'is', null);
      const assetIds = (videoPosts ?? []).map((p) => p.mux_asset_id as string);
      if (assetIds.length > 0) {
        if (muxConfigured()) {
          const gone = await deleteMuxAssets(assetIds);
          console.log(`🗑️ Deleted ${gone}/${assetIds.length} Mux assets`);
        } else {
          console.log('⚠️ Mux not configured; assets left behind:', assetIds);
        }
      }
    }

    for (const { table, column } of deletionOrder) {
      console.log(`🗑️ Deleting from ${table} where ${column} = ${userId}`);
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(column, userId);
      
      if (error) {
        console.log(`⚠️ Error deleting from ${table}: ${error.message}`);
        if (table === 'profiles') throw new Error('Profile deletion failed; media cleanup was not queued');
        // Continue independent legacy cleanup; retry failures through existing tooling.
      }
    }

    // Clean up orphaned dm_threads where user was the only remaining member
    console.log('🗑️ Cleaning up orphaned DM threads');
    const { data: emptyThreads } = await supabaseAdmin
      .from('dm_threads')
      .select('id')
      .not('id', 'in', 
        `(SELECT DISTINCT thread_id FROM dm_thread_members)`
      );
    // Use raw query approach: find threads with 0 members via left join
    // Since we can't do subqueries easily, just log it — the threads are harmless without members

    // Exact nested Storage keys were durably queued by the profile-delete
    // trigger. The private-media-cleanup worker retries Storage API deletion;
    // authorization already denies content whose sender profile is gone.

    // Finally, delete the auth user
    console.log('🗑️ Deleting auth user');
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (deleteAuthError) {
      console.log('❌ Error deleting auth user:', deleteAuthError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Account deleted successfully for user: ${userId}`);
    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
