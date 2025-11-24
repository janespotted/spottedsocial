import { createContext, useContext, useState, ReactNode } from 'react';

interface CheckInContextType {
  showCheckIn: boolean;
  openCheckIn: () => void;
  closeCheckIn: () => void;
}

const CheckInContext = createContext<CheckInContextType | undefined>(undefined);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [showCheckIn, setShowCheckIn] = useState(false);

  const openCheckIn = () => setShowCheckIn(true);
  const closeCheckIn = () => setShowCheckIn(false);

  return (
    <CheckInContext.Provider value={{ showCheckIn, openCheckIn, closeCheckIn }}>
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
