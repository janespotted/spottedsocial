export type NightStatus = 'planning' | 'out' | 'home' | 'heading_out' | 'off' | null;
export type DeliveryMethod = 'modal' | 'push';

export interface NudgeTriggerContext {
  userId: string;
  status: NightStatus;
  currentVenueId?: string;
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
