import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface VenueIdCardContextType {
  selectedVenueId: string | null;
  openVenueCard: (venueId: string) => void;
  closeVenueCard: () => void;
}

const VenueIdCardContext = createContext<VenueIdCardContextType | undefined>(undefined);

export function VenueIdCardProvider({ children }: { children: ReactNode }) {
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const openVenueCard = (venueId: string) => {
    // Dismiss any open friend card so they don't stack
    window.dispatchEvent(new CustomEvent('dismissFriendCard'));
    setSelectedVenueId(venueId);
  };

  const closeVenueCard = () => {
    setSelectedVenueId(null);
  };

  // Listen for dismiss requests from friend card
  useEffect(() => {
    const handler = () => setSelectedVenueId(null);
    window.addEventListener('dismissVenueCard', handler);
    return () => window.removeEventListener('dismissVenueCard', handler);
  }, []);

  return (
    <VenueIdCardContext.Provider value={{ selectedVenueId, openVenueCard, closeVenueCard }}>
      {children}
    </VenueIdCardContext.Provider>
  );
}

export function useVenueIdCard() {
  const context = useContext(VenueIdCardContext);
  if (context === undefined) {
    throw new Error('useVenueIdCard must be used within a VenueIdCardProvider');
  }
  return context;
}
