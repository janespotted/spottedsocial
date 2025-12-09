import { createContext, useContext, useState, ReactNode } from 'react';

export interface DetectedVenue {
  id: string;
  name: string;
  lat: number;
  lng: number;
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
  showVenueArrival: () => void;
  hideVenueArrival: () => void;
  setDetectedVenue: (venue: DetectedVenue | null) => void;
}

const CheckInContext = createContext<CheckInContextType | undefined>(undefined);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [isReminderTriggered, setIsReminderTriggered] = useState(false);
  const [showVenueArrivalPrompt, setShowVenueArrivalPrompt] = useState(false);
  const [detectedVenue, setDetectedVenue] = useState<DetectedVenue | null>(null);

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
      showVenueArrival,
      hideVenueArrival,
      setDetectedVenue,
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
