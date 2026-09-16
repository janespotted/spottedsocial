import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Authenticate: only allow calls bearing the service-role key.
  // verify_jwt is false (cron doesn't send a user JWT), so we check manually.
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey!)

    // Calculate today's 5 AM ET boundary, DST-aware
    const now = new Date()
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = etFormatter.formatToParts(now)
    const etYear = parts.find(p => p.type === 'year')!.value
    const etMonth = parts.find(p => p.type === 'month')!.value
    const etDay = parts.find(p => p.type === 'day')!.value
    const etHour = parseInt(parts.find(p => p.type === 'hour')!.value)

    // Build "now" as interpreted in ET (no TZ), then compare to real UTC to get offset
    const etNowLocal = new Date(`${etYear}-${etMonth}-${etDay}T${String(etHour).padStart(2, '0')}:${parts.find(p => p.type === 'minute')!.value}:${parts.find(p => p.type === 'second')!.value}`)
    const offsetMs = now.getTime() - etNowLocal.getTime()

    // Build 5:00 AM ET today, then convert to UTC using the same offset
    const fiveAmETLocal = new Date(`${etYear}-${etMonth}-${etDay}T05:00:00`)
    const fiveAmUTC = new Date(fiveAmETLocal.getTime() + offsetMs)

    // If we're before 5 AM ET, use yesterday's 5 AM
    if (now < fiveAmUTC) {
      fiveAmUTC.setTime(fiveAmUTC.getTime() - 86400000)
    }

    // "Tonight" is per city (5 AM in the city's own zone — mobile/src/lib/tonight.ts).
    // Rows that carry their own expires_at were stamped by the client in the
    // right zone, so they are judged against now(). Rows without one (profile
    // GPS, DMs, notifications) use the EARLIEST supported reset — 5 AM Eastern —
    // which is the conservative cutoff: it can never delete something still
    // "tonight" in a later zone. The cron therefore runs after EACH city's
    // reset (10:10 and 13:10 UTC) and every step here is idempotent.
    const cutoff = fiveAmUTC.toISOString()
    console.log(`🧹 5am cleanup running. Cutoff: ${cutoff}`)

    // Users who are legitimately still out anywhere: status='out' with an
    // unexpired, city-zoned expiry. Everything "live" hangs off this set.
    const { data: validOut, error: validOutErr } = await supabase
      .from('night_statuses')
      .select('user_id')
      .eq('status', 'out')
      .gt('expires_at', now.toISOString())
    if (validOutErr) console.error('Error fetching valid out statuses:', validOutErr)
    const validUserIds = new Set((validOut || []).map(s => s.user_id))

    // PostgREST filters travel in the URL — keep id lists to a bounded size.
    const chunk = <T,>(arr: T[], size = 200): T[][] => {
      const out: T[][] = []
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
      return out
    }

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

    // 1b. Backstop: clear is_out/GPS for any profile whose night_statuses row
    // is NOT currently status='out' with unexpired expires_at.
    // This guarantees a ≤24h ceiling on any GPS resurrection bug.
    {
      // Find profiles that are is_out=true but have no valid 'out' night_status
      const { data: outProfiles, error: outProfErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_out', true)

      if (outProfErr) {
        console.error('Error fetching out profiles for backstop:', outProfErr)
      } else if (outProfiles && outProfiles.length > 0 && !validOutErr) {
        const orphanedIds = outProfiles.map(p => p.id).filter(id => !validUserIds.has(id))

        let backstopCleared = 0
        for (const ids of chunk(orphanedIds)) {
          const { data: cleared, error: backstopErr } = await supabase
            .from('profiles')
            .update({
              is_out: false,
              last_known_lat: null,
              last_known_lng: null,
              last_location_at: null,
            })
            .in('id', ids)
            .select('id')
          if (backstopErr) console.error('Error in is_out backstop clear:', backstopErr)
          else backstopCleared += cleared?.length || 0
        }
        if (orphanedIds.length > 0) {
          console.log(`✅ Backstop cleared ${backstopCleared} orphaned is_out profiles`)
        }
      }
    }

    // 2. End stale check-ins: a check-in is open only while its user is still
    // out (city-zoned expiry), so end every open one whose user is not.
    // Skipped if the valid-out lookup failed — ending everyone's check-in on
    // a transient read error would be worse than a late cleanup.
    let endedCheckins = 0
    let checkinsError: unknown = validOutErr
    if (!validOutErr) {
      const { data: openCheckins, error: openErr } = await supabase
        .from('checkins')
        .select('id, user_id')
        .is('ended_at', null)
      checkinsError = openErr
      const staleIds = (openCheckins || [])
        .filter(c => !validUserIds.has(c.user_id))
        .map(c => c.id)
      for (const ids of chunk(staleIds)) {
        const { data: ended, error: endErr } = await supabase
          .from('checkins')
          .update({ ended_at: now.toISOString() })
          .in('id', ids)
          .select('id')
        if (endErr) checkinsError = endErr
        else endedCheckins += ended?.length || 0
      }
    }

    if (checkinsError) {
      console.error('Error ending stale checkins:', checkinsError)
    } else {
      console.log(`✅ Ended ${endedCheckins} stale check-ins`)
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

    // 4. Clear expired night statuses (including private-party fields)
    const { data: clearedStatuses, error: statusesError } = await supabase
      .from('night_statuses')
      .update({
        status: 'home',
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        expires_at: null,
        is_private_party: false,
        party_neighborhood: null,
        party_address: null,
        planning_visibility: null,
      })
      .lt('expires_at', now.toISOString())
      .select('id')

    if (statusesError) {
      console.error('Error clearing expired statuses:', statusesError)
    } else {
      console.log(`✅ Cleared ${clearedStatuses?.length || 0} expired night statuses`)
    }

    // 5. Delete expired posts (their own city-zoned expiry, not the ET cutoff)
    const { data: deletedPosts, error: postsError } = await supabase
      .from('posts')
      .delete()
      .lt('expires_at', now.toISOString())
      .select('id')

    if (postsError) {
      console.error('Error deleting expired posts:', postsError)
    } else {
      console.log(`✅ Deleted ${deletedPosts?.length || 0} expired posts`)
    }

    // 6. Delete expired yap messages (their own city-zoned expiry)
    const { data: deletedYaps, error: yapsError } = await supabase
      .from('yap_messages')
      .delete()
      .lt('expires_at', now.toISOString())
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
        ended_checkins: endedCheckins,
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
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
