// Types
export type { NightStatus, DeliveryMethod, NudgeTriggerContext, ToastTriggerContext, DetectedVenue, NudgeDecision, DwellTracker } from './types';

// Trigger layer
export { 
  canTrigger, 
  canTriggerToast,
  isVenueDismissed, 
  dismissVenuePrompt, 
  markCheckingStart, 
  markCheckingEnd,
  markToastShown,
  suppressVenueTonight,
  resetDwellTracker,
} from './trigger';

// Delivery layer
export { createModalDelivery, createPushDelivery, getDeliveryMethod, getAudienceLabel } from './delivery';
export type { NudgeDeliveryHandler } from './delivery';
