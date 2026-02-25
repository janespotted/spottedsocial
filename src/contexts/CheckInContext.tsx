import { createContext, useContext, useState, ReactNode } from 'react';

export interface DetectedVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distance?: number;
}

interface CheckInContextType {
  showCheckIn: boolean;
  isReminderTriggered: boolean;
  openCheckIn: () => void;
  openCheckInFromReminder: () => void;
  closeCheckIn: () => void;
  // Venue arrival prompt state
  showVenueArrivalPrompt: boolean;
  detectedVenue: DetectedVenue | null;
  nearbyVenues: DetectedVenue[];
  showVenueArrival: () => void;
  hideVenueArrival: () => void;
  setDetectedVenue: (venue: DetectedVenue | null) => void;
  setNearbyVenues: (venues: DetectedVenue[]) => void;
  // Check-in confirmation state
  showCheckInConfirmation: boolean;
  checkInConfirmationType: 'out' | 'planning' | null;
  checkInVenueName: string | null;
  checkInVenueId: string | null;
  checkInNeighborhood: string | null;
  checkInPrivacyLevel: string | null;
  checkInIsPrivateParty: boolean;
  showOutConfirmation: (venueName: string, venueId: string, privacyLevel: string, isPrivateParty?: boolean) => void;
  showPlanningConfirmation: (neighborhood: string | null, privacyLevel: string) => void;
  closeCheckInConfirmation: () => void;
}

const CheckInContext = createContext<CheckInContextType | undefined>(undefined);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [isReminderTriggered, setIsReminderTriggered] = useState(false);
  const [showVenueArrivalPrompt, setShowVenueArrivalPrompt] = useState(false);
  const [detectedVenue, setDetectedVenue] = useState<DetectedVenue | null>(null);
  const [nearbyVenues, setNearbyVenues] = useState<DetectedVenue[]>([]);
  
  // Check-in confirmation state
  const [showCheckInConfirmation, setShowCheckInConfirmation] = useState(false);
  const [checkInConfirmationType, setCheckInConfirmationType] = useState<'out' | 'planning' | null>(null);
  const [checkInVenueName, setCheckInVenueName] = useState<string | null>(null);
  const [checkInVenueId, setCheckInVenueId] = useState<string | null>(null);
  const [checkInNeighborhood, setCheckInNeighborhood] = useState<string | null>(null);
  const [checkInPrivacyLevel, setCheckInPrivacyLevel] = useState<string | null>(null);
  const [checkInIsPrivateParty, setCheckInIsPrivateParty] = useState(false);

  const openCheckIn = () => {
    setIsReminderTriggered(false);
    setShowCheckIn(true);
  };

  const openCheckInFromReminder = () => {
    setIsReminderTriggered(true);
    setShowCheckIn(true);
  };
  
  const closeCheckIn = () => {
    setShowCheckIn(false);
    setIsReminderTriggered(false);
  };

  const showVenueArrival = () => setShowVenueArrivalPrompt(true);
  const hideVenueArrival = () => {
    setShowVenueArrivalPrompt(false);
    setDetectedVenue(null);
    setNearbyVenues([]);
  };

  const showOutConfirmation = (venueName: string, venueId: string, privacyLevel: string, isPrivateParty: boolean = false) => {
    setCheckInConfirmationType('out');
    setCheckInVenueName(venueName);
    setCheckInVenueId(venueId);
    setCheckInNeighborhood(null);
    setCheckInPrivacyLevel(privacyLevel);
    setCheckInIsPrivateParty(isPrivateParty);
    setShowCheckInConfirmation(true);
  };

  const showPlanningConfirmation = (neighborhood: string | null, privacyLevel: string) => {
    setCheckInConfirmationType('planning');
    setCheckInVenueName(null);
    setCheckInNeighborhood(neighborhood);
    setCheckInPrivacyLevel(privacyLevel);
    setShowCheckInConfirmation(true);
  };

  const closeCheckInConfirmation = () => {
    setShowCheckInConfirmation(false);
    setCheckInConfirmationType(null);
    setCheckInVenueName(null);
    setCheckInVenueId(null);
    setCheckInNeighborhood(null);
    setCheckInPrivacyLevel(null);
    setCheckInIsPrivateParty(false);
  };

  return (
    <CheckInContext.Provider value={{ 
      showCheckIn, 
      isReminderTriggered, 
      openCheckIn, 
      openCheckInFromReminder, 
      closeCheckIn,
      showVenueArrivalPrompt,
      detectedVenue,
      nearbyVenues,
      showVenueArrival,
      hideVenueArrival,
      setDetectedVenue,
      setNearbyVenues,
      showCheckInConfirmation,
      checkInConfirmationType,
      checkInVenueName,
      checkInVenueId,
      checkInNeighborhood,
      checkInPrivacyLevel,
      checkInIsPrivateParty,
      showOutConfirmation,
      showPlanningConfirmation,
      closeCheckInConfirmation,
    }}>
      {children}
    </CheckInContext.Provider>
  );
}

export function useCheckIn() {
  const context = useContext(CheckInContext);
  if (context === undefined) {
    throw new Error('useCheckIn must be used within a CheckInProvider');
  }
  return context;
}
