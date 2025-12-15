import type { DetectedVenue, DeliveryMethod } from './types';

// Delivery interface - allows future push implementation
export interface NudgeDeliveryHandler {
  deliver: (venue: DetectedVenue) => void | Promise<void>;
}

// Map location_sharing_level to display label
export function getAudienceLabel(level: string): string {
  const labels: Record<string, string> = {
    'close_friends': '💛 close friends',
    'all_friends': '👫 all friends',
    'mutual_friends': '🔗 mutual friends',
  };
  return labels[level] || '👫 friends';
}

// Modal delivery (current implementation)
export function createModalDelivery(
  setDetectedVenue: (venue: { id: string; name: string; lat: number; lng: number } | null) => void,
  showVenueArrival: () => void
): NudgeDeliveryHandler {
  return {
    deliver: (venue: DetectedVenue) => {
      setDetectedVenue({
        id: venue.id,
        name: venue.name,
        lat: venue.lat,
        lng: venue.lng,
      });
      showVenueArrival();
    },
  };
}

// Push delivery (future placeholder)
export function createPushDelivery(userId: string): NudgeDeliveryHandler {
  return {
    deliver: async (venue: DetectedVenue) => {
      // Future: Call edge function to send push notification
      console.log('[VenueArrivalNudge] Push delivery not yet implemented', { userId, venue });
      // await supabase.functions.invoke('send-venue-arrival-push', { body: { userId, venue } });
    },
  };
}

// Get appropriate delivery method based on app state
export function getDeliveryMethod(isAppForeground: boolean): DeliveryMethod {
  return isAppForeground ? 'modal' : 'push';
}
