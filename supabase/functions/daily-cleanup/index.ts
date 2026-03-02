import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Calculate today's 5am boundary in UTC
    // The cron runs at 9:10 UTC (5:10am ET), so "today's 5am ET" = today 9:00 UTC
    const now = new Date()
    const fiveAmToday = new Date(now)
    fiveAmToday.setUTCHours(9, 0, 0, 0) // 9:00 UTC = 5:00 AM ET
    
    // If somehow running before 9 UTC, use yesterday's 9 UTC
    if (now < fiveAmToday) {
      fiveAmToday.setUTCDate(fiveAmToday.getUTCDate() - 1)
    }

    const cutoff = fiveAmToday.toISOString()
    console.log(`🧹 5am cleanup running. Cutoff: ${cutoff}`)

    // 1. Clear stale locations on profiles
    const { data: clearedProfiles, error: profilesError } = await supabase
      .from('profiles')
      .update({
        is_out: false,
        last_known_lat: null,
        last_known_lng: null,
        last_location_at: null,
      })
      .eq('is_out', true)
      .lt('last_location_at', cutoff)
      .select('id')

    if (profilesError) {
      console.error('Error clearing stale locations:', profilesError)
    } else {
      console.log(`✅ Cleared ${clearedProfiles?.length || 0} stale locations`)
    }

    // 2. End stale check-ins
    const { data: endedCheckins, error: checkinsError } = await supabase
      .from('checkins')
      .update({ ended_at: now.toISOString() })
      .is('ended_at', null)
      .lt('started_at', cutoff)
      .select('id')

    if (checkinsError) {
      console.error('Error ending stale checkins:', checkinsError)
    } else {
      console.log(`✅ Ended ${endedCheckins?.length || 0} stale check-ins`)
    }

    // 3. Delete expired DMs (created before 5am cutoff)
    const { data: deletedDMs, error: dmsError } = await supabase
      .from('dm_messages')
      .delete()
      .lt('created_at', cutoff)
      .select('id')

    if (dmsError) {
      console.error('Error deleting expired DMs:', dmsError)
    } else {
      console.log(`✅ Deleted ${deletedDMs?.length || 0} expired DMs`)
    }

    // 4. Clear expired night statuses
    const { data: clearedStatuses, error: statusesError } = await supabase
      .from('night_statuses')
      .update({ 
        status: 'home',
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        expires_at: null,
      })
      .lt('expires_at', now.toISOString())
      .select('id')

    if (statusesError) {
      console.error('Error clearing expired statuses:', statusesError)
    } else {
      console.log(`✅ Cleared ${clearedStatuses?.length || 0} expired night statuses`)
    }

    // 5. Delete expired posts
    const { data: deletedPosts, error: postsError } = await supabase
      .from('posts')
      .delete()
      .lt('expires_at', cutoff)
      .select('id')

    if (postsError) {
      console.error('Error deleting expired posts:', postsError)
    } else {
      console.log(`✅ Deleted ${deletedPosts?.length || 0} expired posts`)
    }

    // 6. Delete expired yap messages
    const { data: deletedYaps, error: yapsError } = await supabase
      .from('yap_messages')
      .delete()
      .lt('expires_at', cutoff)
      .select('id')

    if (yapsError) {
      console.error('Error deleting expired yaps:', yapsError)
    } else {
      console.log(`✅ Deleted ${deletedYaps?.length || 0} expired yap messages`)
    }

    // 7. Reset planning statuses to home
    const { data: clearedPlanning, error: planningError } = await supabase
      .from('night_statuses')
      .update({
        status: 'home',
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        expires_at: null,
        planning_neighborhood: null,
        planning_visibility: null,
      })
      .eq('status', 'planning')
      .lt('updated_at', cutoff)
      .select('id')

    if (planningError) {
      console.error('Error clearing planning statuses:', planningError)
    } else {
      console.log(`✅ Cleared ${clearedPlanning?.length || 0} planning statuses`)
    }

    // 8. Delete expired plans (based on their own expires_at, not the 5am cutoff)
    const { data: deletedPlans, error: plansError } = await supabase
      .from('plans')
      .delete()
      .lt('expires_at', now.toISOString())
      .select('id')

    if (plansError) {
      console.error('Error deleting expired plans:', plansError)
    } else {
      console.log(`✅ Deleted ${deletedPlans?.length || 0} expired plans`)
    }

    // 9. Delete expired notifications (from prior nights)
    const { data: deletedNotifs, error: notifsError } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoff)
      .select('id')

    if (notifsError) {
      console.error('Error deleting expired notifications:', notifsError)
    } else {
      console.log(`✅ Deleted ${deletedNotifs?.length || 0} expired notifications`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        cleared_locations: clearedProfiles?.length || 0,
        ended_checkins: endedCheckins?.length || 0,
        deleted_dms: deletedDMs?.length || 0,
        cleared_statuses: clearedStatuses?.length || 0,
        deleted_posts: deletedPosts?.length || 0,
        deleted_yaps: deletedYaps?.length || 0,
        cleared_planning: clearedPlanning?.length || 0,
        deleted_plans: deletedPlans?.length || 0,
        deleted_notifications: deletedNotifs?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('5am cleanup error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
