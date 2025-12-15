export type NightStatus = 'planning' | 'out' | 'home' | 'heading_out' | 'off' | null;
export type DeliveryMethod = 'modal' | 'push' | 'toast';

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

export interface NudgeDecision {
  shouldNudge: boolean;
  reason: string;
  venue?: DetectedVenue;
}
