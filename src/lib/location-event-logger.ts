import { supabase } from '@/integrations/supabase/client';

export type LocationEventType =
  | 'trigger_evaluated'
  | 'prompt_shown'
  | 'prompt_dismissed'
  | 'prompt_confirmed'
  | 'silent_toast_shown'
  | 'manual_correction';

export type TriggerResult =
  | 'fired'
  | 'suppressed_accuracy'
  | 'suppressed_distance'
  | 'suppressed_dwell'
  | 'suppressed_speed'
  | 'suppressed_cooldown';

export interface ThresholdsMet {
  accuracy_ok: boolean;
  distance_ok: boolean;
  dwell_ok: boolean;
  speed_ok: boolean;
}

export interface LocationEventData {
  evaluation_id: string;
  user_id?: string;
  event_type: LocationEventType;
  evaluated_venue_id?: string | null;
  evaluated_venue_name?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_accuracy_meters?: number | null;
  distance_to_venue_meters?: number | null;
  dwell_time_seconds?: number | null;
  speed_mph?: number | null;
  user_status_before?: string | null;
  user_status_after?: string | null;
  thresholds_met?: ThresholdsMet | null;
  result?: TriggerResult | null;
  friends_at_venue_count?: number;
}

// Module-level state: current evaluation_id for correlating events in a flow
let _currentEvaluationId: string | null = null;

export function setCurrentEvaluationId(id: string): void {
  _currentEvaluationId = id;
}

export function getCurrentEvaluationId(): string | null {
  return _currentEvaluationId;
}

// Truncate GPS to 5 decimal places (~1m precision)
function truncGps(val: number | null | undefined): number | null {
  if (val == null) return null;
  return Math.round(val * 100000) / 100000;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createEvaluationId(): string {
  const id = generateUUID();
  _currentEvaluationId = id;
  return id;
}

async function getFriendsAtVenueCount(userId: string, venueId: string): Promise<number> {
  try {
    const { data: friends } = await supabase
      .from('friendships')
      .select('friend_id, user_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (!friends || friends.length === 0) return 0;

    const friendIds = friends.map(f => f.user_id === userId ? f.friend_id : f.user_id);

    const { count } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .in('user_id', friendIds)
      .eq('venue_id', venueId)
      .is('ended_at', null);

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Log a location pipeline event. Fire-and-forget -- never blocks the caller.
 */
export function logLocationEvent(data: LocationEventData): void {
  const now = new Date();

  (async () => {
    try {
      let userId = data.user_id;
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        userId = user.id;
      }

      let friendsCount = data.friends_at_venue_count ?? 0;
      if (data.evaluated_venue_id && userId && friendsCount === 0) {
        friendsCount = await getFriendsAtVenueCount(userId, data.evaluated_venue_id);
      }

      supabase
        .from('location_events')
        .insert({
          evaluation_id: data.evaluation_id,
          user_id: userId,
          event_type: data.event_type,
          evaluated_venue_id: data.evaluated_venue_id ?? null,
          evaluated_venue_name: data.evaluated_venue_name ?? null,
          gps_lat: truncGps(data.gps_lat),
          gps_lng: truncGps(data.gps_lng),
          gps_accuracy_meters: data.gps_accuracy_meters != null
            ? Math.round(data.gps_accuracy_meters * 10) / 10
            : null,
          distance_to_venue_meters: data.distance_to_venue_meters != null
            ? Math.round(data.distance_to_venue_meters * 10) / 10
            : null,
          dwell_time_seconds: data.dwell_time_seconds != null
            ? Math.round(data.dwell_time_seconds)
            : null,
          speed_mph: data.speed_mph != null
            ? Math.round(data.speed_mph * 10) / 10
            : null,
          time_of_day: now.getHours(),
          day_of_week: now.getDay(),
          user_status_before: data.user_status_before ?? null,
          user_status_after: data.user_status_after ?? null,
          thresholds_met: data.thresholds_met ?? null,
          result: data.result ?? null,
          friends_at_venue_count: friendsCount,
        })
        .then(({ error }) => {
          if (error) console.warn('[LocationEvents] Insert failed:', error.message);
        });
    } catch (e) {
      console.warn('[LocationEvents] Log failed:', e);
    }
  })();
}

// Track last auto-checkin for manual_correction detection
let _lastAutoCheckin: { evaluationId: string; venueId: string; timestamp: number } | null = null;

export function markAutoCheckin(evaluationId: string, venueId: string): void {
  _lastAutoCheckin = { evaluationId, venueId, timestamp: Date.now() };
}

const CORRECTION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a manual check-in at a different venue qualifies as a correction
 * of a recent auto check-in. If so, log a manual_correction event.
 */
export function checkForManualCorrection(
  userId: string,
  manualVenueId: string,
  manualVenueName: string,
  lat: number,
  lng: number,
): void {
  if (!_lastAutoCheckin) return;
  if (_lastAutoCheckin.venueId === manualVenueId) return;
  if (Date.now() - _lastAutoCheckin.timestamp > CORRECTION_WINDOW_MS) return;

  logLocationEvent({
    evaluation_id: _lastAutoCheckin.evaluationId,
    user_id: userId,
    event_type: 'manual_correction',
    evaluated_venue_id: manualVenueId,
    evaluated_venue_name: manualVenueName,
    gps_lat: lat,
    gps_lng: lng,
  });

  _lastAutoCheckin = null;
}
