import { createContext, useContext, useState, ReactNode } from 'react';

interface CheckInContextType {
  showCheckIn: boolean;
  isReminderTriggered: boolean;
  openCheckIn: () => void;
  openCheckInFromReminder: () => void;
  closeCheckIn: () => void;
}

const CheckInContext = createContext<CheckInContextType | undefined>(undefined);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [isReminderTriggered, setIsReminderTriggered] = useState(false);

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

  return (
    <CheckInContext.Provider value={{ showCheckIn, isReminderTriggered, openCheckIn, openCheckInFromReminder, closeCheckIn }}>
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
