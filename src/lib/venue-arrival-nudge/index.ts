// Types
export type { 
  NightStatus, 
  DeliveryMethod, 
  NudgeTriggerContext, 
  ToastTriggerContext, 
  DetectedVenue, 
  NudgeDecision, 
  DwellTracker,
  VenueArrivalContext,
  VenueDeparture,
  LocationSnapshot,
} from './types';

// Trigger layer - unified engine
export { 
  canTriggerVenueArrival,
  canTrigger, 
  canTriggerToast,
  isVenueDismissed, 
  dismissVenuePrompt, 
  markCheckingStart, 
  markCheckingEnd,
  markToastShown,
  suppressVenueTonight,
  resetDwellTracker,
  recordDeparture,
  updatePreviousVenue,
  getPreviousVenueId,
  clearDepartureTracking,
  updateLocationSnapshot,
} from './trigger';

// Delivery layer
export { createModalDelivery, createPushDelivery, getDeliveryMethod, getAudienceLabel } from './delivery';
export type { NudgeDeliveryHandler } from './delivery';
