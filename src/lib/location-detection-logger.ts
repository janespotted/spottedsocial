import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

type DetectionEventType = 'detection' | 'confirmation' | 'correction' | 'dismissal' | 'error';

interface LogDetectionParams {
  eventType: DetectionEventType;
  detectedVenueId?: string | null;
  confirmedVenueId?: string | null;
  userLat?: number | null;
  userLng?: number | null;
  gpsAccuracy?: number | null;
  distanceToVenue?: number | null;
  wasCorrect?: boolean | null;
  errorType?: string | null;
  errorMessage?: string | null;
  metadata?: Json | null;
}

/**
 * Log location detection events for analytics and accuracy monitoring
 */
export async function logDetectionEvent(params: LogDetectionParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('location_detection_logs').insert([{
      user_id: user.id,
      event_type: params.eventType,
      detected_venue_id: params.detectedVenueId ?? null,
      confirmed_venue_id: params.confirmedVenueId ?? null,
      user_lat: params.userLat ?? null,
      user_lng: params.userLng ?? null,
      gps_accuracy: params.gpsAccuracy ?? null,
      distance_to_venue: params.distanceToVenue ?? null,
      was_correct: params.wasCorrect ?? null,
      error_type: params.errorType ?? null,
      error_message: params.errorMessage ?? null,
      metadata: params.metadata ?? null,
    }]);
  } catch (error) {
    // Silent fail - analytics shouldn't break the app
    console.error('Failed to log detection event:', error);
  }
}

/**
 * Log when a venue is detected
 */
export async function logVenueDetection(
  venueId: string,
  userLat: number,
  userLng: number,
  gpsAccuracy: number,
  distanceToVenue: number
): Promise<void> {
  await logDetectionEvent({
    eventType: 'detection',
    detectedVenueId: venueId,
    userLat,
    userLng,
    gpsAccuracy,
    distanceToVenue,
  });
}

/**
 * Log when a user confirms their venue (correct detection)
 */
export async function logVenueConfirmation(
  detectedVenueId: string,
  confirmedVenueId: string,
  wasCorrect: boolean
): Promise<void> {
  await logDetectionEvent({
    eventType: 'confirmation',
    detectedVenueId,
    confirmedVenueId,
    wasCorrect,
  });
}

/**
 * Log when a user corrects to a different venue
 */
export async function logVenueCorrection(
  detectedVenueId: string | null,
  correctedToVenueId: string,
  userLat?: number,
  userLng?: number
): Promise<void> {
  await logDetectionEvent({
    eventType: 'correction',
    detectedVenueId,
    confirmedVenueId: correctedToVenueId,
    userLat,
    userLng,
    wasCorrect: false,
  });
}

/**
 * Log when a user dismisses venue prompt
 */
export async function logVenueDismissal(
  venueId: string,
  reason?: string
): Promise<void> {
  await logDetectionEvent({
    eventType: 'dismissal',
    detectedVenueId: venueId,
    metadata: reason ? { reason } : null,
  });
}

/**
 * Log location-related errors
 */
export async function logLocationError(
  errorType: string,
  errorMessage: string,
  metadata?: Json
): Promise<void> {
  await logDetectionEvent({
    eventType: 'error',
    errorType,
    errorMessage,
    metadata: metadata ?? null,
  });
}

/**
 * Report a venue location issue
 */
export async function reportVenueLocation(params: {
  venueId?: string | null;
  reportType: 'wrong_location' | 'confirmed' | 'new_venue' | 'correction';
  reportedLat: number;
  reportedLng: number;
  userLat: number;
  userLng: number;
  suggestedVenueName?: string;
  suggestedVenueType?: string;
  notes?: string;
}): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from('venue_location_reports').insert([{
      venue_id: params.venueId ?? null,
      user_id: user.id,
      report_type: params.reportType,
      reported_lat: params.reportedLat,
      reported_lng: params.reportedLng,
      user_lat: params.userLat,
      user_lng: params.userLng,
      suggested_venue_name: params.suggestedVenueName ?? null,
      suggested_venue_type: params.suggestedVenueType ?? null,
      notes: params.notes ?? null,
    }]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to report venue location:', error);
    return false;
  }
}
