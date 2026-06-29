export type NightStatus = 'planning' | 'out' | 'home' | 'heading_out' | 'off' | null;
export type DeliveryMethod = 'modal' | 'toast' | 'push';

export interface VenueArrivalContext {
  userId: string;
  status: NightStatus;
  currentVenueId: string | null;
  detectedVenueId: string;
  distance: number; // Distance to detected venue in meters
  gpsAccuracy: number;
  locationSharingLevel: string;
  lat: number;
  lng: number;
  timestamp: number; // For stale detection
}

export interface ThresholdsMet {
  accuracy_ok: boolean;
  distance_ok: boolean;
  dwell_ok: boolean;
  speed_ok: boolean;
}

export type TriggerResult =
  | 'fired'
  | 'suppressed_accuracy'
  | 'suppressed_distance'
  | 'suppressed_dwell'
  | 'suppressed_speed'
  | 'suppressed_cooldown';

export interface NudgeDecision {
  shouldNudge: boolean;
  reason: string;
  deliveryMethod?: DeliveryMethod;
  venue?: DetectedVenue;
  evaluationId?: string;
  thresholdsMet?: ThresholdsMet;
  result?: TriggerResult;
  dwellTimeSeconds?: number;
}

export interface DwellTracker {
  venueId: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface DetectedVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance?: number;
}

export interface VenueDeparture {
  venueId: string;
  departedAt: number;
  maxDistanceReached: number; // Max distance observed since departure
}

export interface LocationSnapshot {
  lat: number;
  lng: number;
  timestamp: number;
}

// Legacy types for backwards compatibility during migration
export interface NudgeTriggerContext {
  userId: string;
  status: NightStatus;
  currentVenueId?: string;
  detectedVenueId?: string;
  gpsAccuracy?: number;
}

export interface ToastTriggerContext extends NudgeTriggerContext {
  currentVenueId: string | null;
  detectedVenueId: string;
  gpsAccuracy: number;
  locationSharingLevel: string;
}
