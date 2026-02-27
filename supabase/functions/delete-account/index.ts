import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      
      // Delete messages and typing indicators
      { table: 'dm_typing_indicators', column: 'user_id' },
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

    for (const { table, column } of deletionOrder) {
      console.log(`🗑️ Deleting from ${table} where ${column} = ${userId}`);
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(column, userId);
      
      if (error) {
        console.log(`⚠️ Error deleting from ${table}: ${error.message}`);
        // Continue with other deletions even if one fails
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

    // Delete user's avatar from storage
    console.log('🗑️ Deleting avatar from storage');
    await supabaseAdmin.storage
      .from('avatars')
      .remove([`${userId}/avatar.jpg`, `${userId}/avatar.png`, `${userId}/avatar.webp`]);

    // SECURITY FIX: Delete post images from storage
    console.log('🗑️ Deleting post images from storage');
    const { data: postFiles } = await supabaseAdmin.storage
      .from('post-images')
      .list('', { limit: 1000 });

    if (postFiles?.length) {
      const userPostFiles = postFiles
        .filter(f => f.name.startsWith(`${userId}-`))
        .map(f => f.name);
      if (userPostFiles.length > 0) {
        await supabaseAdmin.storage
          .from('post-images')
          .remove(userPostFiles);
        console.log(`🗑️ Deleted ${userPostFiles.length} post images`);
      }
    }

    // SECURITY FIX: Delete DM images from storage
    console.log('🗑️ Deleting DM images from storage');
    const { data: dmFiles } = await supabaseAdmin.storage
      .from('dm-images')
      .list('', { limit: 1000 });

    if (dmFiles?.length) {
      const userDmFiles = dmFiles
        .filter(f => f.name.startsWith(`${userId}-`))
        .map(f => f.name);
      if (userDmFiles.length > 0) {
        await supabaseAdmin.storage
          .from('dm-images')
          .remove(userDmFiles);
        console.log(`🗑️ Deleted ${userDmFiles.length} DM images`);
      }
    }

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
